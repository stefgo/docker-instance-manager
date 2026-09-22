import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository, type ImageCheckTarget } from "../repositories/DockerStateRepository.js";
import { ActivityService } from "./ActivityService.js";
import { ProxyService } from "./ProxyService.js";
import { ImageUpdateService, logger } from "@dim/shared/node";
import { WS_EVENTS, imageCheckTargetKey } from "@dim/shared";

export interface ImageUpdateCheckSchedulerStatus {
    lastRun: string | null;
    nextRun: string | null;
    isRunning: boolean;
}

let timer: NodeJS.Timeout | null = null;
let lastRun: Date | null = null;
let nextRun: Date | null = null;
let isRunning = false;
/**
 * The first target a rate limit left unchecked. The next sweep starts there, so a limit
 * that comes back every run does not keep asking about the same head of the list and never
 * about its tail. Held in memory only: a restart starts the list from the front again,
 * which is no worse than the first sweep after startup ever was.
 */
let resumeKey: string | null = null;

function readIntervalSeconds(): number {
    const raw = appConfig.settings.image_update_check_interval_seconds ?? "0";
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function broadcast() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.SCHEDULER_STATUS_UPDATE,
        payload: {
            imageUpdateCheck: {
                lastRun: lastRun?.toISOString() ?? null,
                nextRun: nextRun?.toISOString() ?? null,
                isRunning,
            },
        },
    });
}

/**
 * Puts the target a rate limit stopped the last sweep at in front, keeping the order of the
 * rest. The list is rebuilt from the stored snapshots on every sweep, so the target may be
 * gone by now -- then the sweep starts from the front, as it did before there was a cursor.
 */
function rotateToResumePoint(targets: ImageCheckTarget[]): ImageCheckTarget[] {
    if (!resumeKey) return targets;
    const index = targets.findIndex((t) => imageCheckTargetKey(t) === resumeKey);
    if (index <= 0) return targets;
    return [...targets.slice(index), ...targets.slice(0, index)];
}

export class ImageUpdateCheckSchedulerService {
    static async run(): Promise<number> {
        if (isRunning) {
            logger.warn("Image update check already running, skipping");
            return 0;
        }
        isRunning = true;
        broadcast();
        try {
            const targets = rotateToResumePoint(DockerStateRepository.getImageCheckTargets());
            const now = new Date().toISOString();
            let checked = 0;
            // Set once a registry has turned a request away over its rate limit. Every
            // further request would be refused the same way, so the rest of the sweep is
            // written from here instead of asked: see recordImageCheckSkipped.
            let rateLimit: string | null = null;
            // Where the next sweep picks up, once the limit has left something unasked.
            let skippedFrom: string | null = null;

            for (const target of targets) {
                const { repoTag, repoDigests, platform } = target;
                if (rateLimit) {
                    if (!skippedFrom) skippedFrom = imageCheckTargetKey(target);
                    DockerStateRepository.recordImageCheckSkipped(target, rateLimit, now);
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
                        checkedAt: now,
                        ...(result.error ? { error: result.error } : {}),
                    });
                    checked++;
                    if (result.rateLimited) rateLimit = result.error ?? "Registry rate limit reached (429)";
                } catch (err) {
                    logger.error({ err, repoTag }, "Scheduled image update check failed for tag");
                }
            }

            resumeKey = skippedFrom;
            if (rateLimit) {
                logger.warn(
                    { checked, total: targets.length, resumeKey },
                    "Image update check stopped by registry rate limit",
                );
                ActivityService.record({
                    kind: "imagecheck.interrupted",
                    level: "warning",
                    data: { checked, total: targets.length, error: rateLimit },
                });
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
        return {
            lastRun: lastRun?.toISOString() ?? null,
            nextRun: nextRun?.toISOString() ?? null,
            isRunning,
        };
    }
}
