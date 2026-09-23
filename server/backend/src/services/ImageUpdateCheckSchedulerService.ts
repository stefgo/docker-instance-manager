import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository, type ImageCheckTarget } from "../repositories/DockerStateRepository.js";
import { SchedulerStateRepository } from "../repositories/SchedulerStateRepository.js";
import { ActivityService } from "./ActivityService.js";
import { ScheduledJob } from "./ScheduledJob.js";
import { ImageUpdateService, logger } from "@dim/shared/node";
import {
    RATE_LIMIT_FALLBACK_SECONDS,
    imageCheckTargetKey,
    registryOf,
    type ImageUpdateCheckSchedulerStatus,
    type RegistryStatus,
    type SchedulerRunResults,
    type SchedulerTrigger,
} from "@dim/shared";

/**
 * What the scheduler knows about one registry host. A rate limit is the host's, not one
 * repository's -- Docker Hub counts per IP or account across all of them -- so the pause and
 * the point to resume from are kept per host. A limit at Docker Hub leaves ghcr.io and a
 * private registry to be asked as before.
 *
 * Saved to `scheduler_state` after every sweep and read back once, on first use after
 * startup: a restart neither forgets a pause nor sends a group back to its front.
 */
interface RegistryState {
    /** Until when this registry is not asked again. */
    pausedUntil: Date | null;
    /**
     * The first target of this registry a rate limit left unchecked. The next sweep starts
     * its group there, so a limit that comes back every run does not keep asking about the
     * same head of the list and never about its tail.
     */
    resumeKey: string | null;
    lastCheckedAt: Date | null;
    lastError: string | null;
    /** Whether `lastError` is the rate limit, which is over once the pause is. */
    rateLimited: boolean;
    remaining: number | null;
    /** Targets actually asked about in the last sweep. */
    checked: number;
}

const registries = new Map<string, RegistryState>();
let restored = false;

/** `RegistryState` as `scheduler_state.state` holds it: dates as ISO strings. */
interface SavedRegistryState {
    registry: string;
    pausedUntil: string | null;
    resumeKey: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
    rateLimited: boolean;
    remaining: number | null;
    checked: number;
}

const toDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

/** Reads the registry states the last sweep saved, once per process. */
function restoreRegistries(): void {
    if (restored) return;
    restored = true;
    const saved = SchedulerStateRepository.state("image-update-check") as
        { registries?: SavedRegistryState[] } | null;
    for (const r of saved?.registries ?? []) {
        if (typeof r?.registry !== "string") continue;
        registries.set(r.registry, {
            pausedUntil: toDate(r.pausedUntil),
            resumeKey: r.resumeKey ?? null,
            lastCheckedAt: toDate(r.lastCheckedAt),
            lastError: r.lastError ?? null,
            rateLimited: !!r.rateLimited,
            remaining: typeof r.remaining === "number" ? r.remaining : null,
            checked: typeof r.checked === "number" ? r.checked : 0,
        });
    }
}

function saveRegistries(): void {
    const saved: SavedRegistryState[] = [...registries].map(([registry, state]) => ({
        registry,
        pausedUntil: state.pausedUntil?.toISOString() ?? null,
        resumeKey: state.resumeKey,
        lastCheckedAt: state.lastCheckedAt?.toISOString() ?? null,
        lastError: state.lastError,
        rateLimited: state.rateLimited,
        remaining: state.remaining,
        checked: state.checked,
    }));
    SchedulerStateRepository.saveState("image-update-check", { registries: saved });
}

function stateOf(registry: string): RegistryState {
    let state = registries.get(registry);
    if (!state) {
        state = {
            pausedUntil: null, resumeKey: null, lastCheckedAt: null, lastError: null,
            rateLimited: false, remaining: null, checked: 0,
        };
        registries.set(registry, state);
    }
    return state;
}

function isPaused(state: RegistryState | undefined, now: Date): boolean {
    return !!state?.pausedUntil && state.pausedUntil > now;
}

function readIntervalSeconds(): number {
    const raw = appConfig.settings.image_update_check_interval_seconds ?? "0";
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** The check targets by registry host, each group in the order the list gave them. */
function groupByRegistry(targets: ImageCheckTarget[]): Map<string, ImageCheckTarget[]> {
    const groups = new Map<string, ImageCheckTarget[]>();
    for (const target of targets) {
        const registry = registryOf(target.repoTag);
        const group = groups.get(registry);
        if (group) group.push(target);
        else groups.set(registry, [target]);
    }
    return groups;
}

/**
 * Puts the target a rate limit stopped the last sweep at in front, keeping the order of the
 * rest. The list is rebuilt from the stored snapshots on every sweep, so the target may be
 * gone by now -- then the group starts from the front, as it did before there was a cursor.
 */
function rotateToResumePoint(targets: ImageCheckTarget[], resumeKey: string | null): ImageCheckTarget[] {
    if (!resumeKey) return targets;
    const index = targets.findIndex((t) => imageCheckTargetKey(t) === resumeKey);
    if (index <= 0) return targets;
    return [...targets.slice(index), ...targets.slice(0, index)];
}

/**
 * Asks about one registry's targets until they are done or the registry turns a request
 * away over its rate limit. Then the rest of the group is written as skipped instead of
 * asked, the registry is paused for as long as it said, and the next sweep resumes the
 * group where this one stopped. Returns how many targets were asked about, and whether the
 * registry was paused.
 */
async function sweepRegistry(
    registry: string,
    group: ImageCheckTarget[],
    now: Date,
): Promise<{ checked: number; paused: boolean }> {
    const state = stateOf(registry);
    const checkedAt = now.toISOString();
    const targets = rotateToResumePoint(group, state.resumeKey);
    let checked = 0;
    let failed = 0;
    let lastError: string | null = null;
    let rateLimit: { error: string; retryAfterSeconds: number } | null = null;
    let skippedFrom: string | null = null;

    for (const target of targets) {
        const { repoTag, repoDigests, platform } = target;
        if (rateLimit) {
            if (!skippedFrom) skippedFrom = imageCheckTargetKey(target);
            DockerStateRepository.recordImageCheckSkipped(target, rateLimit.error, checkedAt);
            continue;
        }
        try {
            const result = await ImageUpdateService.checkForUpdate(repoTag, repoDigests, platform);
            DockerStateRepository.updateImageCheckResult({
                imageRef: repoTag,
                platform,
                localDigest: result.localDigest,
                hasUpdate: result.hasUpdate,
                remoteDigest: result.remoteDigest,
                checkedAt,
                ...(result.error ? { error: result.error } : {}),
                ...(result.remoteLabels !== undefined ? { remoteLabels: result.remoteLabels } : {}),
            });
            checked++;
            if (result.rateLimitRemaining !== undefined) state.remaining = result.rateLimitRemaining;
            if (result.error) {
                failed++;
                lastError = result.error;
            }
            if (result.rateLimited) {
                rateLimit = {
                    error: result.error ?? "Registry rate limit reached (429)",
                    retryAfterSeconds: result.retryAfterSeconds ?? RATE_LIMIT_FALLBACK_SECONDS,
                };
            }
        } catch (err) {
            logger.error({ err, repoTag }, "Scheduled image update check failed for tag");
        }
    }

    state.checked = checked;
    state.resumeKey = skippedFrom;
    if (checked > 0) state.lastCheckedAt = now;

    if (rateLimit) {
        state.pausedUntil = new Date(Date.now() + rateLimit.retryAfterSeconds * 1000);
        state.lastError = rateLimit.error;
        state.rateLimited = true;
        logger.warn(
            { registry, checked, total: targets.length, resumeKey: skippedFrom, pausedUntil: state.pausedUntil },
            "Image update check stopped by registry rate limit",
        );
        ActivityService.record({
            kind: "imagecheck.interrupted",
            level: "warning",
            data: {
                checked,
                total: targets.length,
                error: rateLimit.error,
                registry,
                retryAfterSeconds: rateLimit.retryAfterSeconds,
            },
        });
    } else {
        state.pausedUntil = null;
        state.rateLimited = false;
        // A registry is in error when nothing it was asked came back without one; a single
        // missing tag says nothing about the registry.
        state.lastError = checked > 0 && failed === checked ? lastError : null;
    }
    return { checked, paused: rateLimit !== null };
}

/** The registry list of the status, built from the current targets. */
function describeRegistries(): RegistryStatus[] {
    restoreRegistries();
    const now = new Date();
    const groups = groupByRegistry(DockerStateRepository.getImageCheckTargets());
    // Built from the current targets, so a registry shows before its first sweep -- without
    // times, until the scheduler has something to say.
    return [...groups].map(([registry, group]) => {
        const state = registries.get(registry);
        const paused = isPaused(state, now);
        return {
            registry,
            targets: group.length,
            checked: state?.checked ?? 0,
            lastCheckedAt: state?.lastCheckedAt?.toISOString() ?? null,
            pausedUntil: paused ? state!.pausedUntil!.toISOString() : null,
            remaining: state?.remaining ?? null,
            // A rate limit is over once its pause is, even before the next sweep says so.
            error: state && (paused || !state.rateLimited) ? state.lastError : null,
        };
    }).sort((a, b) => a.registry.localeCompare(b.registry));
}

const job = new ScheduledJob({
    id: "image-update-check",
    intervalMs: () => readIntervalSeconds() * 1000,
    outcome: (result) => (result.pausedRegistries.length > 0 ? "partial" : "success"),
    describe: (status): ImageUpdateCheckSchedulerStatus => ({ ...status, registries: describeRegistries() }),
});

export class ImageUpdateCheckSchedulerService {
    /**
     * One sweep over every check target, registry by registry.
     *
     * A registry still paused by a rate limit is left out, and its images keep what they
     * last knew; a run in which every registry is paused does not take place at all. The
     * manual run asks every registry: an explicit request from the user, and one that turns
     * it away again is paused anew. Returns how many targets were asked about.
     */
    static async run(trigger: SchedulerTrigger = "schedule"): Promise<number> {
        if (job.isRunning) {
            logger.warn("Image update check already running, skipping");
            return 0;
        }
        restoreRegistries();
        const now = new Date();
        const ignorePause = trigger === "manual";
        const groups = groupByRegistry(DockerStateRepository.getImageCheckTargets());
        const due = new Set(
            [...groups.keys()].filter((registry) => ignorePause || !isPaused(registries.get(registry), now)),
        );
        if (groups.size > 0 && due.size === 0) {
            logger.info("Every registry is paused by a rate limit, skipping image update check");
            return 0;
        }

        const result = await job.run(trigger, async (): Promise<SchedulerRunResults["image-update-check"]> => {
            let checked = 0;
            let total = 0;
            const pausedRegistries: string[] = [];
            try {
                for (const [registry, group] of groups) {
                    total += group.length;
                    if (!due.has(registry)) {
                        stateOf(registry).checked = 0;
                        continue;
                    }
                    const sweep = await sweepRegistry(registry, group, now);
                    checked += sweep.checked;
                    if (sweep.paused) pausedRegistries.push(registry);
                }
            } finally {
                saveRegistries();
            }
            logger.info({ checked, total }, "Image update check completed");
            return { checked, total, pausedRegistries };
        });
        return result.checked;
    }

    static startScheduler(): void {
        restoreRegistries();
        job.start(() => this.run("schedule"));
    }

    static stopScheduler(): void {
        job.stop();
        job.broadcast();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): ImageUpdateCheckSchedulerStatus {
        return job.status() as ImageUpdateCheckSchedulerStatus;
    }
}
