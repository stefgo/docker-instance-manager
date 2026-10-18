import fs from "fs";
import Dockerode from "dockerode";
import { DEFAULT_SELF_UPDATE_VERIFY_SECONDS } from "@dim/shared";
import { logger } from "@dim/shared/node";
import { config } from "../core/Config.js";
import { readJsonFile, removeDataFile, writeJsonFile } from "../core/DataStore.js";
import { VERSION } from "../core/Version.js";
import { createDockerode } from "./DockerService.js";
import { buildCreateOptions, imageConfigOf } from "./ContainerConfig.js";
import { ActivityService } from "./ActivityService.js";
import {
    SelfUpdateOutcome,
    correlationIdOf,
    filterHelperEnv,
    helperEnv,
    outcomeEvent,
    parseOutcome,
} from "./SelfUpdateOutcome.js";

/**
 * Where the helper leaves the outcome of a self-update for the agent that runs afterwards --
 * the new one, or the old one it was rolled back to. It lives in the data directory, which the
 * helper mounts for exactly this reason: nothing else survives from one agent to the next.
 */
const OUTCOME_FILE = "self-update.json";

/** How long a new container without a healthcheck has to keep running to count as up. */
const STABLE_SECONDS = 30;

/** How often the new container is inspected while it proves itself. */
const VERIFY_POLL_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the own container ID if running inside Docker, otherwise null.
 * Docker sets HOSTNAME to the container ID by default.
 */
function getOwnContainerId(): string | null {
    try {
        if (!fs.existsSync("/.dockerenv")) return null;
    } catch {
        return null;
    }
    return process.env.HOSTNAME || null;
}

/**
 * Checks whether a given container ID matches this process's container.
 * Uses prefix match since HOSTNAME may be the short ID (12 chars).
 */
export function isOwnContainer(containerId: string): boolean {
    const ownId = getOwnContainerId();
    if (!ownId) return false;
    return containerId.startsWith(ownId) || ownId.startsWith(containerId);
}

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Spawns a helper container that will replace the current (old) container.
 * Called from the normal-mode client when a self-update is detected, through
 * `WorkGate.replaceSelf` -- never directly, or it cuts short whatever else is running.
 *
 * The helper gets the agent's mounts as well as its binds: the Docker socket is usually a
 * bind, the data directory usually a named volume, and the helper needs both -- the second to
 * leave the outcome where the next agent finds it. It is told the settings it needs by
 * environment, because it runs the new image and may not read this agent's config.yaml the way
 * this agent does. Among them is `correlationId`, the action or auto-update run that asked for
 * the update, so the outcome the next agent reports lands in that group.
 *
 * `exited` settles once the helper has gone. On success the helper stops this process
 * first, so a caller that sees it settle knows the helper failed; the outcome it left is
 * reported then.
 */
export async function spawnHelperContainer(
    newImage: string,
    correlationId: string | null,
): Promise<{ exited: Promise<unknown> }> {
    const docker = createDockerode();
    const ownId = getOwnContainerId();
    if (!ownId) throw new Error("Cannot spawn helper: not running in Docker");

    const ownInfo = await docker.getContainer(ownId).inspect();
    const ownName = ownInfo.Name.replace(/^\//, "");
    const helperName = `${ownName}-update-${Date.now()}`;

    logger.info({ helperName, newImage }, "Spawning self-update helper container");

    const env = helperEnv({
        oldContainer: ownName,
        oldVersion: VERSION,
        verifySeconds: config.selfUpdateVerifySeconds,
        dataDir: process.env.DIM_CLIENT_DATA_DIR,
        correlationId,
    });

    const helperContainer = await docker.createContainer({
        name: helperName,
        Image: newImage,
        Env: env,
        HostConfig: {
            AutoRemove: true,
            Binds: ownInfo.HostConfig.Binds || [],
            Mounts: ownInfo.HostConfig.Mounts || [],
            PortBindings: {},
        },
    } as Dockerode.ContainerCreateOptions);

    await helperContainer.start();
    logger.info({ helperName }, "Self-update helper container started");
    return {
        exited: helperContainer
            .wait()
            .catch(() => {})
            .then(() => reportSelfUpdateOutcome()),
    };
}

/**
 * Waits until the new container has shown that it works: healthy, where its image has a
 * healthcheck, or running for `STABLE_SECONDS` without a restart where it has none. Throws as
 * soon as it has shown that it does not.
 */
async function verifyReplacement(container: Dockerode.Container, seconds: number): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    const first = await container.inspect();
    const test = first.Config.Healthcheck?.Test;
    const hasHealthcheck = Array.isArray(test) && test.length > 0 && test[0] !== "NONE";
    const stableAt = Date.now() + Math.min(seconds, STABLE_SECONDS) * 1000;

    for (;;) {
        const info = await container.inspect();
        const state = info.State;
        if (!state.Running || state.Restarting || info.RestartCount > 0) {
            throw new Error(`The new container stopped (exit code ${state.ExitCode})`);
        }
        if (hasHealthcheck) {
            const health = state.Health?.Status;
            if (health === "healthy") return;
            if (health === "unhealthy") throw new Error("The new container reported unhealthy");
        } else if (Date.now() >= stableAt) {
            return;
        }
        if (Date.now() >= deadline) {
            throw new Error(`The new container was not healthy after ${seconds}s`);
        }
        await sleep(VERIFY_POLL_MS);
    }
}

function verifySeconds(): number {
    const value = Number(process.env.DIM_SELF_UPDATE_VERIFY_SECONDS);
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_SELF_UPDATE_VERIFY_SECONDS;
}

/**
 * Runs the helper-mode logic: replaces the old container with a new one, then exits.
 * Called at startup when DIM_HELPER_MODE=true.
 *
 * The old container is set aside rather than removed -- renamed, so the new one can take its
 * name, and stopped, so it frees its ports -- and only removed once the new one has proved
 * itself. Anything that goes wrong on the way puts the old one back under its own name and
 * starts it again: an agent on the previous release is one the operator can still reach, a
 * missing one is not.
 */
export async function executeHelperMode(): Promise<never> {
    const oldContainerName = process.env.DIM_OLD_CONTAINER;
    if (!oldContainerName) {
        logger.error("DIM_OLD_CONTAINER env var not set");
        process.exit(1);
    }

    const docker = createDockerode();
    const correlationId = correlationIdOf(process.env.DIM_CORRELATION_ID);
    const fromVersion = process.env.DIM_OLD_VERSION || null;
    const startedAt = new Date().toISOString();

    // 1. Inspect the old container and this helper. Nothing has changed if this fails.
    let oldInfo: Dockerode.ContainerInspectInfo;
    let newImage: string;
    let newImageId: string;
    try {
        oldInfo = await docker.getContainer(oldContainerName).inspect();
        const ownInfo = await docker.getContainer(process.env.HOSTNAME!).inspect();
        newImage = ownInfo.Config.Image;
        newImageId = ownInfo.Image;
        logger.info({ container: oldContainerName, newImage }, "Inspected old container and new image");
    } catch (err) {
        logger.error({ err, oldContainer: oldContainerName }, "Self-update FAILED before anything was changed");
        // The old agent is still running and reads this once the helper has gone: without it
        // the action or run that asked for the update would say nothing about its failure.
        writeJsonFile(OUTCOME_FILE, {
            outcome: "rolled-back",
            container: oldContainerName,
            correlationId,
            fromVersion,
            toVersion: VERSION,
            startedAt,
            finishedAt: new Date().toISOString(),
            error: message(err),
        } satisfies SelfUpdateOutcome);
        process.exit(1);
    }

    const originalName = oldInfo.Name.replace(/^\//, "");
    const parkedName = `${originalName}-rollback-${Date.now()}`;
    // By id: its name changes on the way.
    const oldContainer = docker.getContainer(oldInfo.Id);
    const record: SelfUpdateOutcome = {
        outcome: "pending",
        container: originalName,
        correlationId,
        fromImageId: oldInfo.Image,
        fromVersion,
        toImage: newImage,
        toImageId: newImageId,
        toVersion: VERSION,
        startedAt,
    };
    const finish = (outcome: SelfUpdateOutcome["outcome"], extra: Partial<SelfUpdateOutcome> = {}) => {
        writeJsonFile(OUTCOME_FILE, { ...record, ...extra, outcome, finishedAt: new Date().toISOString() });
    };

    let renamed = false;
    let created: Dockerode.Container | null = null;
    try {
        // The old image is read before anything moves, while it is certain to still be there.
        const oldImageConfig = await imageConfigOf(docker, oldInfo);

        // 2. Set the old container aside under another name.
        logger.info({ container: originalName, parkedAs: parkedName }, "Setting the old container aside...");
        await oldContainer.rename({ name: parkedName });
        renamed = true;
        writeJsonFile(OUTCOME_FILE, record);

        // 3. Stop it, which frees its ports and ends the old agent.
        logger.info({ container: parkedName }, "Stopping old container...");
        await oldContainer.stop().catch(() => {});

        // 4. Create and start the new container under the original name.
        const options = buildCreateOptions(oldInfo, newImage, oldImageConfig);
        if (options.Env) options.Env = filterHelperEnv(options.Env);
        logger.info({ name: originalName, image: newImage }, "Creating replacement container...");
        created = await docker.createContainer(options);
        logger.info({ name: originalName }, "Starting replacement container...");
        await created.start();

        // 5. Let it prove itself.
        const seconds = verifySeconds();
        logger.info({ name: originalName, seconds }, "Waiting for the replacement container to become healthy...");
        await verifyReplacement(created, seconds);
    } catch (err) {
        logger.error({ err, container: originalName }, "Self-update FAILED, rolling back to the old container");
        try {
            if (created) await created.remove({ force: true });
            if (renamed) await oldContainer.rename({ name: originalName });
            if (!(await oldContainer.inspect()).State.Running) await oldContainer.start();
            // Written also where nothing had moved yet: the old agent is then still running,
            // reads it once this helper has gone, and reports that its update did not take.
            finish("rolled-back", { error: message(err) });
            logger.info({ container: originalName }, "Rolled back to the old container");
        } catch (rollbackErr) {
            finish("failed", { error: message(err), rollbackError: message(rollbackErr) });
            logger.fatal(
                { err: rollbackErr, container: originalName, parkedAs: renamed ? parkedName : null },
                "Rollback FAILED -- restore the old container by hand (docker rename, docker start)",
            );
        }
        process.exit(1);
    }

    // 6. The new container works: the old one is not needed any more. One that cannot be
    // removed is left behind stopped, which costs disk space and nothing else.
    await oldContainer.remove({ force: true }).catch((err) => {
        logger.warn({ err, container: parkedName }, "Could not remove the old container; remove it by hand");
    });
    finish("completed");
    logger.info("Self-update completed successfully");
    process.exit(0);
}

/**
 * Reports the outcome of the last self-update, if one was left, and clears it. Called by the
 * agent on start -- the new one after a success, the old one after a rollback -- and by an
 * agent whose helper ended without replacing it.
 *
 * A `pending` outcome means the helper is still watching this very agent come up: it is read
 * again until the helper has decided, and for no longer than the helper could take.
 *
 * It is reported under the id of the action or run that asked for the update, which the
 * helper kept in the file: this agent has no scope open for that group.
 */
export function reportSelfUpdateOutcome(): void {
    const stored = parseOutcome(readJsonFile(OUTCOME_FILE));
    if (!stored) return;

    if (stored.outcome === "pending") {
        const started = Date.parse(stored.startedAt);
        const giveUpAt = (isNaN(started) ? Date.now() : started) + (config.selfUpdateVerifySeconds + 60) * 1000;
        if (Date.now() < giveUpAt) {
            setTimeout(() => reportSelfUpdateOutcome(), 5_000).unref();
            return;
        }
        // The helper never finished -- the host went down under it, say. An old container set
        // aside as `<name>-rollback-*` may be left over.
        logger.warn({ startedAt: stored.startedAt }, "A self-update never recorded its outcome");
        removeDataFile(OUTCOME_FILE);
        return;
    }

    const event = outcomeEvent(stored);
    if (event) ActivityService.report(event);
    removeDataFile(OUTCOME_FILE);
}
