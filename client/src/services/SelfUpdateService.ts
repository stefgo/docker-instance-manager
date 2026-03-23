import fs from "fs";
import Dockerode from "dockerode";
import { createDockerode } from "./DockerService.js";
import { logger } from "../core/logger.js";

const HELPER_ENV_KEYS = ["DIM_HELPER_MODE", "DIM_OLD_CONTAINER"];

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

/**
 * Filters out helper-mode env vars from an environment array.
 */
function filterHelperEnv(env: string[]): string[] {
    return env.filter((e) => !HELPER_ENV_KEYS.some((key) => e.startsWith(`${key}=`)));
}

/**
 * Spawns a helper container that will replace the current (old) container.
 * Called from the normal-mode client when a self-update is detected.
 */
export async function spawnHelperContainer(newImage: string): Promise<void> {
    const docker = createDockerode();
    const ownId = getOwnContainerId();
    if (!ownId) throw new Error("Cannot spawn helper: not running in Docker");

    const ownInfo = await docker.getContainer(ownId).inspect();
    const ownName = ownInfo.Name.replace(/^\//, "");
    const helperName = `${ownName}-update-${Date.now()}`;

    logger.info({ helperName, newImage }, "Spawning self-update helper container");

    const helperContainer = await docker.createContainer({
        name: helperName,
        Image: newImage,
        Env: [
            `DIM_HELPER_MODE=true`,
            `DIM_OLD_CONTAINER=${ownName}`,
        ],
        HostConfig: {
            AutoRemove: true,
            Binds: ownInfo.HostConfig.Binds || [],
            PortBindings: {},
        },
    } as any);

    await helperContainer.start();
    logger.info({ helperName }, "Self-update helper container started");
}

/**
 * Runs the helper-mode logic: replaces the old container with a new one,
 * then exits. Called at startup when DIM_HELPER_MODE=true.
 */
export async function executeHelperMode(): Promise<never> {
    const oldContainerName = process.env.DIM_OLD_CONTAINER;
    if (!oldContainerName) {
        logger.error("DIM_OLD_CONTAINER env var not set");
        process.exit(1);
    }

    const docker = createDockerode();

    try {
        // 1. Inspect old container to capture its full config
        const oldContainer = docker.getContainer(oldContainerName);
        const oldInfo = await oldContainer.inspect();
        logger.info({ container: oldContainerName }, "Inspected old container");

        // 2. Inspect self to get the new image reference
        const ownId = process.env.HOSTNAME!;
        const ownInfo = await docker.getContainer(ownId).inspect();
        const newImage = ownInfo.Config.Image;
        logger.info({ newImage }, "New image determined from helper container");

        // 3. Stop old container (frees ports)
        logger.info({ container: oldContainerName }, "Stopping old container...");
        await oldContainer.stop().catch(() => {});

        // 4. Remove old container
        logger.info({ container: oldContainerName }, "Removing old container...");
        await oldContainer.remove({ force: true });

        // 5. Create new container with original config + new image
        const originalName = oldInfo.Name.replace(/^\//, "");
        const cleanEnv = filterHelperEnv(oldInfo.Config.Env || []);

        logger.info({ name: originalName, image: newImage }, "Creating replacement container...");
        const newContainer = await docker.createContainer({
            name: originalName,
            Image: newImage,
            Env: cleanEnv,
            Cmd: oldInfo.Config.Cmd ?? undefined,
            Labels: oldInfo.Config.Labels ?? undefined,
            ExposedPorts: oldInfo.Config.ExposedPorts,
            HostConfig: oldInfo.HostConfig,
            NetworkingConfig: { EndpointsConfig: oldInfo.NetworkSettings.Networks },
        } as any);

        // 6. Start new container
        logger.info({ name: originalName }, "Starting replacement container...");
        await newContainer.start();

        logger.info("Self-update completed successfully");
        process.exit(0);
    } catch (err) {
        logger.error({ err, oldContainer: oldContainerName }, "Self-update FAILED");
        process.exit(1);
    }
}
