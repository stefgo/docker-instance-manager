import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository, type ImageCheckTarget } from "../repositories/DockerStateRepository.js";
import { ActivityService } from "./ActivityService.js";
import { ProxyService } from "./ProxyService.js";
import { ImageUpdateService, logger } from "@dim/shared/node";
import {
    RATE_LIMIT_FALLBACK_SECONDS,
    WS_EVENTS,
    imageCheckTargetKey,
    registryOf,
    type ImageUpdateCheckSchedulerStatus,
    type RegistryStatus,
} from "@dim/shared";

/**
 * What the scheduler knows about one registry host. A rate limit is the host's, not one
 * repository's -- Docker Hub counts per IP or account across all of them -- so the pause and
 * the point to resume from are kept per host. A limit at Docker Hub leaves ghcr.io and a
 * private registry to be asked as before.
 *
 * Held in memory only: a restart forgets a pause and starts every group from the front,
 * which costs at most one refused request per registry.
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

let timer: NodeJS.Timeout | null = null;
let lastRun: Date | null = null;
let nextRun: Date | null = null;
let isRunning = false;
const registries = new Map<string, RegistryState>();

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

function broadcast() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.SCHEDULER_STATUS_UPDATE,
        payload: { imageUpdateCheck: ImageUpdateCheckSchedulerService.getStatus() },
    });
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
 * group where this one stopped. Returns how many targets were asked about.
 */
async function sweepRegistry(registry: string, group: ImageCheckTarget[], now: Date): Promise<number> {
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
    return checked;
}

export class ImageUpdateCheckSchedulerService {
    /**
     * One sweep over every check target, registry by registry.
     *
     * A registry still paused by a rate limit is left out, and its images keep what they
     * last knew. `ignorePause` is for the manual run: an explicit request from the user asks
     * every registry, and one that turns it away again is paused anew.
     */
    static async run(options: { ignorePause?: boolean } = {}): Promise<number> {
        if (isRunning) {
            logger.warn("Image update check already running, skipping");
            return 0;
        }
        const now = new Date();
        const groups = groupByRegistry(DockerStateRepository.getImageCheckTargets());
        const due = [...groups].filter(
            ([registry]) => options.ignorePause || !isPaused(registries.get(registry), now),
        );
        if (groups.size > 0 && due.length === 0) {
            logger.info("Every registry is paused by a rate limit, skipping image update check");
            return 0;
        }

        isRunning = true;
        broadcast();
        try {
            let checked = 0;
            for (const [registry, group] of groups) {
                if (!due.some(([r]) => r === registry)) {
                    stateOf(registry).checked = 0;
                    continue;
                }
                checked += await sweepRegistry(registry, group, now);
            }
            lastRun = new Date();
            logger.info({ checked }, "Scheduled image update check completed");
            return checked;
        } finally {
            isRunning = false;
            broadcast();
        }
    }

    static startScheduler(): void {
        this.stopScheduler();
        const intervalSeconds = readIntervalSeconds();
        if (intervalSeconds <= 0) {
            nextRun = null;
            logger.info("Image update check scheduler disabled");
            return;
        }
        const intervalMs = intervalSeconds * 1000;
        nextRun = new Date(Date.now() + intervalMs);
        broadcast();
        timer = setInterval(async () => {
            try {
                await this.run();
            } catch (err) {
                logger.error({ err }, "Scheduled image update check sweep failed");
            }
            const seconds = readIntervalSeconds();
            nextRun = seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;
            broadcast();
        }, intervalMs);
        timer.unref?.();
        logger.info({ intervalSeconds }, "Image update check scheduler started");
    }

    static stopScheduler(): void {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        nextRun = null;
        broadcast();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): ImageUpdateCheckSchedulerStatus {
        const now = new Date();
        const groups = groupByRegistry(DockerStateRepository.getImageCheckTargets());
        // Built from the current targets, so a registry shows before its first sweep and
        // after a restart -- without times, until the scheduler has something to say.
        const registryStatus: RegistryStatus[] = [...groups].map(([registry, group]) => {
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
        });
        return {
            lastRun: lastRun?.toISOString() ?? null,
            nextRun: nextRun?.toISOString() ?? null,
            isRunning,
            registries: registryStatus.sort((a, b) => a.registry.localeCompare(b.registry)),
        };
    }
}
