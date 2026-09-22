import { randomUUID } from "crypto";
import cron, { ScheduledTask } from "node-cron";
import {
    AutoUpdatePolicy,
    AutoUpdatePolicyProject,
    DockerContainer,
    DockerImage,
    ImagePlatform,
    ProjectAssignment,
    containerNameOf,
    resolveAssignment,
} from "@dim/shared";
import { ImageUpdateService, logger } from "@dim/shared/node";
import { readJsonFile, writeJsonFile } from "../core/DataStore.js";
import { ActivityService } from "./ActivityService.js";
import { createDockerode, DockerService } from "./DockerService.js";
import { PolicyService } from "./PolicyService.js";
import { isOwnContainer } from "./SelfUpdateService.js";

/** Where the schedules keep what they have to survive a restart. */
const STATE_FILE = "state.json";

/** The schedule for everything on this host that belongs to no project DIM knows. */
const HOST_SCHEDULE = "host";

/**
 * Spread before a scheduled run starts. A fleet configured from one place is configured
 * with one expression, so without this every host would reach for the registry in the same
 * second -- which the registry notices before the hosts do.
 */
const RUN_JITTER_MAX_MS = 120_000;

/**
 * How long after start a missed run waits. Boot is the busiest moment a host has: the
 * daemon is still starting containers, and pulling images into that is the one thing a
 * catch-up has no reason to hurry for.
 */
const CATCH_UP_DELAY_MS = 5 * 60_000;
const CATCH_UP_JITTER_MAX_MS = 5 * 60_000;

/**
 * What one schedule remembers between runs.
 *
 * `nextRun` is stored together with the `cron` it was computed from, because that is what
 * makes it answerable later: a stored time only means "a run was due" while the plan it
 * came from is still the plan. `startedAt` is set for the length of a run and is how an
 * interrupted one is recognised -- a host that lost power mid-run comes back with a run
 * that was begun and never finished.
 */
interface ScheduleState {
    cron: string;
    nextRun: string | null;
    lastRun: string | null;
    startedAt: string | null;
    /**
     * Whether the run that is under way is recreating this agent's own container. The
     * process then ends by design, so the unfinished run is not a fault to report -- but it
     * is still unfinished, and what it had not reached yet is picked up on the next start.
     */
    selfUpdate?: boolean;
}

type StateFile = Record<string, ScheduleState>;

/** One container that takes part, with everything the run needs to decide about it. */
interface Candidate {
    containerId: string;
    name: string;
    imageRef: string;
    repoDigests: string[];
    /** The platform of the image the container runs, which is what the registry is asked about. */
    platform?: ImagePlatform;
    source: "label" | "project";
    project: AutoUpdatePolicyProject | null;
    delayDays: number;
}

/**
 * A container that matches more than one project, as a run reports it. `fallback: "host"`
 * means its label enrols it and it is updated on the host schedule instead; without a
 * fallback it is not updated at all.
 */
interface Conflict {
    containerId: string;
    name: string;
    imageRef: string;
    projects: AutoUpdatePolicyProject[];
    fallback: "host" | null;
}

/** What the registry said about one image, as the run reports it back to the server. */
interface ImageCheck {
    imageRef: string;
    localDigest: string | null;
    remoteDigest: string | null;
    hasUpdate: boolean;
    platform?: ImagePlatform;
    checkedAt: string;
    error?: string;
}

interface RunOptions {
    catchUp?: boolean;
    /** The time the missed run was due, for a catch-up. */
    scheduledFor?: string | null;
    /** A run somebody asked for from the dashboard rather than one a schedule reached. */
    manual?: boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}

function jitter(max: number): number {
    return Math.floor(Math.random() * max);
}

function readState(): StateFile {
    const stored = readJsonFile(STATE_FILE);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    const state: StateFile = {};
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
        if (!value || typeof value !== "object") continue;
        const entry = value as Partial<ScheduleState>;
        state[key] = {
            cron: typeof entry.cron === "string" ? entry.cron : "",
            nextRun: typeof entry.nextRun === "string" ? entry.nextRun : null,
            lastRun: typeof entry.lastRun === "string" ? entry.lastRun : null,
            startedAt: typeof entry.startedAt === "string" ? entry.startedAt : null,
            ...(entry.selfUpdate === true ? { selfUpdate: true } : {}),
        };
    }
    return state;
}

/**
 * The project a container belongs to, by the queries the policy carries. Client criteria are
 * matched against the host as the server knows it, so this reaches the same answer the
 * dashboard shows.
 */
function assignmentOf(
    container: DockerContainer,
    policy: AutoUpdatePolicy,
): ProjectAssignment<AutoUpdatePolicyProject> {
    return resolveAssignment(policy.projects, policy.host, container);
}

/**
 * The opt-out is the configured label carrying `false`, and it beats every other reason to
 * take part -- including a project that is switched on. Without a configured label there is
 * no key to write it on, and so no opt-out either.
 */
function isOptedOut(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    if (!policy.labelKey) return false;
    const value = container.labels?.[policy.labelKey];
    return typeof value === "string" && value.trim().toLowerCase() === "false";
}

function matchesLabel(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    if (!policy.labelKey) return false;
    const labels = container.labels ?? {};
    if (!(policy.labelKey in labels)) return false;
    if (policy.labelValue === null) return true;
    return labels[policy.labelKey] === policy.labelValue;
}

function parseDelayDays(container: DockerContainer, policy: AutoUpdatePolicy): number {
    const key = policy.delayLabelKey;
    if (!key) return 0;
    const raw = container.labels?.[key];
    if (raw === undefined) return 0;
    const days = parseInt(raw, 10);
    return isNaN(days) || days < 0 ? 0 : days;
}

/**
 * The image a container is to be updated to, plus the digests it currently carries. The
 * configured tag is what a recreate has to pull; `image` only says what it happens to run,
 * which after an earlier pull may be a bare sha256 reference.
 */
function resolveImage(
    container: DockerContainer,
    images: DockerImage[],
): { imageRef: string; repoDigests: string[]; platform?: ImagePlatform } {
    const imageRef = container.configImage ?? container.image;
    const image = images.find((img) => img.repoTags.includes(imageRef));
    // The platform comes from the image the container runs, which after a pull is no
    // longer the one the tag points to; both are built for the same platform unless
    // somebody pulled the tag for another one.
    const running = images.find((img) => img.id === container.imageId);
    const platform = running?.platform ?? image?.platform;
    return { imageRef, repoDigests: image?.repoDigests ?? [], ...(platform ? { platform } : {}) };
}

/**
 * Which schedule a container is on. Membership of a project decides this on its own: the
 * source only says *whether* a container takes part, the project says *when* it is updated,
 * so a labelled container inside a project moves with it rather than updating an hour
 * before the database it talks to.
 *
 * A container that matches several projects has no project schedule. Enrolled by its label,
 * it falls back to the host schedule -- if the host has one; otherwise, and without a label,
 * it is on no schedule (`null`) and is not updated.
 */
function scheduleKeyOf(
    container: DockerContainer,
    assignment: ProjectAssignment<AutoUpdatePolicyProject>,
    policy: AutoUpdatePolicy,
): string | null {
    if (assignment.kind === "project") return projectScheduleKey(assignment.project);
    if (assignment.kind === "none") return HOST_SCHEDULE;
    return hostFallbackOf(container, policy) ? HOST_SCHEDULE : null;
}

/** Whether a conflicting container is updated on the host schedule through its label. */
function hostFallbackOf(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    return (
        matchesLabel(container, policy) &&
        !isOptedOut(container, policy) &&
        policy.hostCron.trim().length > 0
    );
}

function projectScheduleKey(project: AutoUpdatePolicyProject): string {
    return `project:${project.id}`;
}

/**
 * Runs the auto-update this host is configured for, on this host's own clock.
 *
 * The agent owns the truth about its host, so it also owns the decision to act on it: it
 * resolves who takes part from the labels in front of it, asks the registry itself and
 * recreates what has a newer image, with no server in the loop. A server that is down at
 * three in the morning therefore costs nothing but the reporting, which is queued and
 * handed over when it is back.
 *
 * Every schedule in the policy is already resolved by the server, so nothing here knows
 * about defaults or inheritance -- an expression per project, one for the rest of the host.
 */
export class AutoUpdateService {
    private static tasks = new Map<string, ScheduledTask>();
    private static state: StateFile = {};
    private static started = false;
    /** Runs are serialised: two schedules firing together must not pull the same image twice. */
    private static chain: Promise<void> = Promise.resolve();

    /**
     * Brings the schedules up and rebuilds them whenever the policy changes. Called once at
     * start, before any connection: the agent acts on the policy it has, and a server it
     * cannot reach means the last known plan, not none.
     */
    static start(): void {
        if (this.started) return;
        this.started = true;
        this.state = readState();

        // Taken before the schedules are planned: planning stamps the current expression and
        // the coming date over every entry, and what was owed is only readable in what the
        // last process left behind.
        const previous: StateFile = JSON.parse(JSON.stringify(this.state));

        PolicyService.subscribe(() => this.rebuild());
        this.rebuild();
        void this.catchUpMissedRuns(previous);
    }

    /**
     * Runs every schedule this host has, now.
     *
     * What the server asks for is a run, not a list: which containers take part is read off
     * the host the same way a scheduled run reads it, and each schedule keeps its own `runId`
     * so its events group as they always do. Queued behind whatever is running, so a request
     * that lands in the middle of the nightly run waits for it instead of pulling the same
     * image twice.
     */
    static runNow(): void {
        const policy = PolicyService.get();
        if (!policy) {
            logger.warn("Asked to run auto-update, but no policy has arrived yet");
            return;
        }
        const keys = this.schedulesOf(policy).map(([key]) => key);
        if (keys.length === 0) {
            logger.info("Asked to run auto-update, but this host has no schedule configured");
            return;
        }
        for (const key of keys) this.enqueue(key, { manual: true });
    }

    /** Stops every task and plans the current policy from scratch. */
    private static rebuild(): void {
        for (const task of this.tasks.values()) task.stop();
        this.tasks.clear();

        const policy = PolicyService.get();
        if (!policy) return;

        for (const [key, expression] of this.schedulesOf(policy)) {
            if (!cron.validate(expression)) {
                logger.error(
                    { schedule: key, cron: expression },
                    "Ignoring an auto-update schedule with an invalid cron expression",
                );
                continue;
            }
            const task = cron.schedule(expression, () => {
                this.enqueue(key, {});
            });
            this.tasks.set(key, task);
            this.remember(key, {
                cron: expression,
                nextRun: task.getNextRun()?.toISOString() ?? null,
            });
            logger.info({ schedule: key, cron: expression }, "Auto-update schedule planned");
        }

        // Schedules that are no longer configured keep nothing: what they remembered belongs
        // to a plan that is gone, and a stale nextRun would be caught up on a later start.
        for (const key of Object.keys(this.state)) {
            if (!this.tasks.has(key)) delete this.state[key];
        }
        writeJsonFile(STATE_FILE, this.state);
    }

    /**
     * The schedules this policy asks for: one per project that updates itself, plus this
     * host's own for everything outside a project. Projects are planned whether or not they
     * have containers here right now -- a stack deployed after the last policy arrived would
     * otherwise wait for the next one to be scheduled at all, and a run that finds nothing
     * costs a single pass over the container list.
     */
    private static schedulesOf(policy: AutoUpdatePolicy): Array<[string, string]> {
        const schedules: Array<[string, string]> = [];
        if (policy.hostCron.trim()) schedules.push([HOST_SCHEDULE, policy.hostCron.trim()]);
        for (const project of policy.projects) {
            if (!project.autoUpdate || !project.cron.trim()) continue;
            schedules.push([projectScheduleKey(project), project.cron.trim()]);
        }
        return schedules;
    }

    private static remember(key: string, patch: Partial<ScheduleState>): void {
        const current = this.state[key] ?? {
            cron: "",
            nextRun: null,
            lastRun: null,
            startedAt: null,
        };
        this.state[key] = { ...current, ...patch };
        writeJsonFile(STATE_FILE, this.state);
    }

    /** Queues a run behind whatever is already running. */
    private static enqueue(key: string, options: RunOptions): void {
        this.chain = this.chain
            .then(() => this.run(key, options))
            .catch((err) => {
                logger.error({ err, schedule: key }, "Auto-update run failed");
            });
    }

    /**
     * What a stopped agent missed.
     *
     * `node-cron` fires on a clock and knows nothing of the time the process was not
     * running, so a host that is switched off overnight would never update and would never
     * say so either. A stored `nextRun` that has passed is a run that was owed. It is made
     * up **once**, however many dates went by: a fortnight offline is one update, not
     * fourteen, and the containers only exist in one version anyway.
     *
     * An expression that has changed since is not made up at all -- the time that was stored
     * belongs to a plan that no longer exists.
     */
    private static async catchUpMissedRuns(previous: StateFile): Promise<void> {
        const due: Array<[string, RunOptions]> = [];

        for (const [key, entry] of Object.entries(previous)) {
            if (!this.tasks.has(key)) continue;

            if (entry.startedAt) {
                // Begun and never finished. Half a run is not a run: what it had already
                // done is done, what it had not is still outstanding, so it is repeated.
                if (entry.selfUpdate) {
                    logger.info(
                        { schedule: key, startedAt: entry.startedAt },
                        "Resuming an auto-update run that ended by recreating this agent",
                    );
                } else {
                    logger.warn(
                        { schedule: key, startedAt: entry.startedAt },
                        "An auto-update run was interrupted and is repeated",
                    );
                    ActivityService.report({
                        kind: "autoupdate.interrupted",
                        level: "warning",
                        data: { schedule: key, startedAt: entry.startedAt },
                    });
                }
                this.remember(key, { startedAt: null, selfUpdate: false });
                due.push([key, { catchUp: true, scheduledFor: entry.startedAt }]);
                continue;
            }

            if (!entry.nextRun) continue;
            const planned = Date.parse(entry.nextRun);
            if (isNaN(planned) || planned >= Date.now()) continue;
            if (entry.cron !== this.currentCronOf(key)) continue;

            logger.info({ schedule: key, missed: entry.nextRun }, "An auto-update run was missed");
            due.push([key, { catchUp: true, scheduledFor: entry.nextRun }]);
        }

        if (due.length === 0) return;

        await sleep(CATCH_UP_DELAY_MS + jitter(CATCH_UP_JITTER_MAX_MS));
        for (const [key, options] of due) this.enqueue(key, options);
    }

    /** The expression a schedule is planned with right now, or `null` if it is not. */
    private static currentCronOf(key: string): string | null {
        const policy = PolicyService.get();
        if (!policy) return null;
        const found = this.schedulesOf(policy).find(([name]) => name === key);
        return found ? found[1] : null;
    }

    /**
     * One run of one schedule.
     *
     * Everything it causes carries its `runId`: the correlation is entered by the side doing
     * the work, so the dashboard groups a run with its container and image events without
     * matching names inside a time window.
     */
    private static async run(key: string, options: RunOptions): Promise<void> {
        const policy = PolicyService.get();
        if (!policy) return;

        // Spread only what the clock started. A run somebody asked for has a reader waiting
        // for it, and the whole fleet does not arrive at the registry at once because one
        // operator pressed a button.
        if (!options.manual) await sleep(jitter(RUN_JITTER_MAX_MS));

        const runId = randomUUID();
        const startedAt = new Date().toISOString();
        this.remember(key, { startedAt });

        const scope = ActivityService.beginScope(runId);
        const docker = createDockerode();
        const checks: ImageCheck[] = [];
        let updated = 0;
        let failed = 0;
        let skippedDelay = 0;
        let skippedNoUpdate = 0;
        let candidates: Candidate[];
        let conflicts: Conflict[];

        try {
            ({ candidates, conflicts } = await this.collect(key, policy));
            for (const conflict of conflicts) this.reportConflict(conflict, runId);
            logger.info(
                { schedule: key, runId, eligible: candidates.length, catchUp: options.catchUp === true },
                "Auto-update run started",
            );

            // One registry call per image, not per container: a stack of six services on the
            // same image is one question, and the answer does not differ by container.
            const hasUpdate = new Map<string, boolean>();
            const byImage = new Map<string, Candidate[]>();
            for (const candidate of candidates) {
                if (!hasUpdate.has(candidate.imageRef)) {
                    const check = await ImageUpdateService.checkForUpdate(
                        candidate.imageRef,
                        candidate.repoDigests,
                        candidate.platform,
                    );
                    checks.push({
                        imageRef: candidate.imageRef,
                        localDigest: check.localDigest,
                        remoteDigest: check.remoteDigest,
                        hasUpdate: check.hasUpdate,
                        ...(candidate.platform ? { platform: candidate.platform } : {}),
                        checkedAt: new Date().toISOString(),
                        ...(check.error ? { error: check.error } : {}),
                    });
                    hasUpdate.set(candidate.imageRef, check.hasUpdate);
                }
                if (!hasUpdate.get(candidate.imageRef)) {
                    skippedNoUpdate++;
                    continue;
                }
                if (await this.isDelayed(candidate, runId)) {
                    skippedDelay++;
                    continue;
                }
                const group = byImage.get(candidate.imageRef) ?? [];
                group.push(candidate);
                byImage.set(candidate.imageRef, group);
            }

            for (const [imageRef, group] of byImage) {
                // Noted before the work starts, not after: recreating this agent's own
                // container ends this process, and the note is the only thing that will
                // still be there to explain why the run stops here.
                if (group.some((c) => isOwnContainer(c.containerId))) {
                    this.remember(key, { selfUpdate: true });
                }
                try {
                    await DockerService.updateImage(imageRef, docker, scope);
                    updated += group.length;
                    logger.info({ schedule: key, runId, imageRef }, "Auto-update updated an image");
                } catch (err) {
                    failed += group.length;
                    logger.warn({ err, schedule: key, runId, imageRef }, "Auto-update failed for an image");
                }
            }
        } finally {
            ActivityService.endScope(scope);
            const task = this.tasks.get(key);
            this.remember(key, {
                lastRun: new Date().toISOString(),
                startedAt: null,
                selfUpdate: false,
                nextRun: task?.getNextRun()?.toISOString() ?? null,
            });
        }

        // A run that changed nothing says nothing. Otherwise every host would file a line
        // per project every night to report that there was nothing to do, and the list would
        // be mostly that. A run somebody asked for is the exception: there is a reader waiting
        // for an answer, and "nothing to do" is one.
        if (!options.manual && updated === 0 && failed === 0 && skippedDelay === 0 && conflicts.length === 0) {
            logger.info({ schedule: key, runId, eligible: candidates.length }, "Auto-update run: nothing to do");
            return;
        }

        ActivityService.report({
            kind: "autoupdate.run",
            level: failed > 0 || conflicts.some((c) => c.fallback === null) ? "error" : "info",
            correlationId: runId,
            subject: this.subjectOf(key, policy),
            data: {
                schedule: key,
                eligible: candidates.length,
                updated,
                failed,
                skipped: skippedDelay,
                skippedNoUpdate,
                conflicts: conflicts.length,
                checks,
                ...(options.catchUp ? { catchUp: true, scheduledFor: options.scheduledFor ?? null } : {}),
                ...(options.manual ? { manual: true } : {}),
            },
        });
    }

    /** What a run's event is about: the project behind its schedule, or nothing for the host. */
    private static subjectOf(key: string, policy: AutoUpdatePolicy): { projectId: string; projectName: string } | null {
        const project = policy.projects.find((p) => projectScheduleKey(p) === key);
        return project ? { projectId: project.id, projectName: project.name } : null;
    }

    /**
     * Who this schedule is responsible for. Read off the containers in front of the agent
     * every time rather than kept: a container that was created an hour ago is in the list,
     * and one that is gone is not, without anything having to be told about it.
     */
    private static async collect(
        key: string,
        policy: AutoUpdatePolicy,
    ): Promise<{ candidates: Candidate[]; conflicts: Conflict[] }> {
        const { containers, images } = await DockerService.getState();
        const candidates: Candidate[] = [];
        const conflicts: Conflict[] = [];

        for (const container of containers) {
            const assignment = assignmentOf(container, policy);

            if (assignment.kind === "conflict" && !isOptedOut(container, policy)) {
                const fallback = hostFallbackOf(container, policy);
                // Reported by the run that would have updated it: the host run where the
                // label takes it there, otherwise every run of a project it matches -- a
                // container nobody updates is otherwise a silence nobody notices.
                const reportHere = fallback
                    ? key === HOST_SCHEDULE
                    : assignment.projects.some((p) => projectScheduleKey(p) === key);
                if (reportHere) {
                    conflicts.push({
                        containerId: container.id,
                        name: containerNameOf(container),
                        imageRef: resolveImage(container, images).imageRef,
                        projects: assignment.projects,
                        fallback: fallback ? "host" : null,
                    });
                }
            }

            if (scheduleKeyOf(container, assignment, policy) !== key) continue;
            if (isOptedOut(container, policy)) continue;

            const project = assignment.kind === "project" ? assignment.project : null;
            const byLabel = matchesLabel(container, policy);
            const byProject = project?.autoUpdate === true;
            if (!byLabel && !byProject) continue;

            const { imageRef, repoDigests, platform } = resolveImage(container, images);
            candidates.push({
                containerId: container.id,
                name: containerNameOf(container),
                imageRef,
                repoDigests,
                ...(platform ? { platform } : {}),
                source: byLabel ? "label" : "project",
                project,
                delayDays: parseDelayDays(container, policy),
            });
        }

        return { candidates, conflicts };
    }

    /**
     * One event per conflicting container: an error where it is left out, a warning where its
     * label carries it to the host schedule instead.
     */
    private static reportConflict(conflict: Conflict, runId: string): void {
        logger.warn(
            {
                container: conflict.name,
                projects: conflict.projects.map((p) => p.name),
                fallback: conflict.fallback,
            },
            conflict.fallback
                ? "Container matches several projects; updated on the host schedule through its label"
                : "Container matches several projects and is excluded from auto-update",
        );
        ActivityService.report({
            kind: "autoupdate.conflict",
            level: conflict.fallback ? "warning" : "error",
            correlationId: runId,
            subject: {
                containerName: conflict.name,
                containerId: conflict.containerId,
                imageRef: conflict.imageRef,
            },
            data: {
                projectIds: conflict.projects.map((p) => p.id),
                projectNames: conflict.projects.map((p) => p.name),
                fallback: conflict.fallback,
            },
        });
    }

    /**
     * Whether a container's delay label holds this update back. The age is the remote
     * image's own creation date, not the moment it was noticed here: a host that was offline
     * for a week must not restart the waiting period on its own.
     */
    private static async isDelayed(candidate: Candidate, runId: string): Promise<boolean> {
        if (candidate.delayDays <= 0) return false;

        const created = await ImageUpdateService.fetchManifestCreatedDate(
            candidate.imageRef,
            candidate.platform,
        );
        if (created === null) return false;

        const ageMs = Date.now() - created.getTime();
        if (ageMs >= candidate.delayDays * 24 * 60 * 60 * 1000) return false;

        logger.info(
            { container: candidate.name, image: candidate.imageRef, delayDays: candidate.delayDays },
            "Auto-update postponed: the image is younger than the configured delay",
        );
        ActivityService.report({
            kind: "autoupdate.skipped",
            level: "info",
            correlationId: runId,
            subject: {
                containerName: candidate.name,
                containerId: candidate.containerId,
                imageRef: candidate.imageRef,
                ...(candidate.project
                    ? { projectId: candidate.project.id, projectName: candidate.project.name }
                    : {}),
            },
            data: {
                delayDays: candidate.delayDays,
                imageCreatedAt: created.toISOString(),
                source: candidate.source,
            },
        });
        return true;
    }
}
