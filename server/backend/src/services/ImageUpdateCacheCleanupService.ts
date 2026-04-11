import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { logger } from "../core/logger.js";

export interface ImageUpdateCacheCleanupResult {
    orphansRemoved: number;
    expiredRemoved: number;
}

let timer: NodeJS.Timeout | null = null;

function readConfig() {
    const ttlDays = parseInt(appConfig.settings.image_version_cache_ttl_days ?? "0", 10);
    const cleanupOrphans =
        (appConfig.settings.image_version_cache_cleanup_orphans ?? "true") === "true";
    const intervalHours = parseInt(
        appConfig.settings.image_version_cache_cleanup_interval_hours ?? "0",
        10,
    );
    return {
        ttlDays: Number.isFinite(ttlDays) ? ttlDays : 0,
        cleanupOrphans,
        intervalHours: Number.isFinite(intervalHours) ? intervalHours : 0,
    };
}

export class ImageUpdateCacheCleanupService {
    /**
     * Runs the cleanup sweep synchronously using the current settings.
     * Removes orphaned entries (tags no client references anymore) and
     * optionally expired entries whose checked_at is older than the TTL.
     */
    static run(): ImageUpdateCacheCleanupResult {
        const { ttlDays, cleanupOrphans } = readConfig();

        let orphansRemoved = 0;
        let expiredRemoved = 0;

        if (cleanupOrphans) {
            orphansRemoved = DockerStateRepository.cleanupOrphanedImageChecks();
        }
        if (ttlDays > 0) {
            expiredRemoved = DockerStateRepository.cleanupExpiredImageChecks(ttlDays);
        }

        logger.info(
            { orphansRemoved, expiredRemoved, ttlDays, cleanupOrphans },
            "Image version cache cleanup completed",
        );
        return { orphansRemoved, expiredRemoved };
    }

    /**
     * Starts the periodic scheduler based on the configured interval.
     * Interval of 0 disables the scheduler.
     */
    static startScheduler(): void {
        this.stopScheduler();
        const { intervalHours } = readConfig();
        if (intervalHours <= 0) {
            logger.info("Image version cache cleanup scheduler disabled");
            return;
        }
        const intervalMs = intervalHours * 60 * 60 * 1000;
        timer = setInterval(() => {
            try {
                this.run();
            } catch (err) {
                logger.error({ err }, "Scheduled image version cache cleanup failed");
            }
        }, intervalMs);
        // Prevent the timer from keeping the process alive on shutdown
        timer.unref?.();
        logger.info(
            { intervalHours },
            "Image version cache cleanup scheduler started",
        );
    }

    static stopScheduler(): void {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    static restartScheduler(): void {
        this.startScheduler();
    }
}
