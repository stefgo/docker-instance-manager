import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ScheduledJob } from "./ScheduledJob.js";
import { logger } from "@dim/shared/node";
import type { SchedulerStatus, SchedulerTrigger } from "@dim/shared";

export interface ImageUpdateCacheCleanupResult {
    orphansRemoved: number;
    expiredRemoved: number;
}

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

const job = new ScheduledJob({
    id: "image-cache-cleanup",
    intervalMs: () => readConfig().intervalHours * 60 * 60 * 1000,
});

export class ImageUpdateCacheCleanupService {
    /**
     * Runs the cleanup sweep using the current settings. Removes orphaned entries (tags no
     * client references anymore) and optionally expired entries whose checked_at is older
     * than the TTL.
     */
    static run(trigger: SchedulerTrigger = "schedule"): Promise<ImageUpdateCacheCleanupResult> {
        return job.run(trigger, () => {
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
        });
    }

    /** Starts the periodic scheduler; an interval of 0 disables it. */
    static startScheduler(): void {
        job.start(() => this.run("schedule"));
    }

    static stopScheduler(): void {
        job.stop();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): SchedulerStatus<"image-cache-cleanup"> {
        return job.status();
    }
}
