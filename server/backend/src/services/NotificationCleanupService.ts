import { appConfig } from "../config/AppConfig.js";
import { ActivityRepository } from "../repositories/ActivityRepository.js";
import { ContainerUpdateRepository } from "../repositories/ContainerUpdateRepository.js";
import { ScheduledJob } from "./ScheduledJob.js";
import { logger } from "@dim/shared/node";
import type { SchedulerRunResults, SchedulerStatus, SchedulerTrigger } from "@dim/shared";

export type NotificationCleanupResult = SchedulerRunResults["notification-cleanup"];

function readConfig() {
    const ttlDays = parseInt(appConfig.settings.notification_retention_days ?? "90", 10);
    const minKeep = parseInt(appConfig.settings.notification_retention_count ?? "500", 10);
    const intervalHours = parseInt(appConfig.settings.notification_cleanup_interval_hours ?? "24", 10);
    const updatesTtlDays = parseInt(appConfig.settings.update_history_retention_days ?? "365", 10);
    const updatesMinKeep = parseInt(appConfig.settings.update_history_retention_count ?? "2000", 10);
    return {
        ttlDays: Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 90,
        minKeep: Number.isFinite(minKeep) && minKeep >= 0 ? minKeep : 500,
        intervalHours: Number.isFinite(intervalHours) ? intervalHours : 24,
        updatesTtlDays: Number.isFinite(updatesTtlDays) && updatesTtlDays > 0 ? updatesTtlDays : 365,
        updatesMinKeep: Number.isFinite(updatesMinKeep) && updatesMinKeep >= 0 ? updatesMinKeep : 2000,
    };
}

/**
 * Retention for the activity list, and for the container update history alongside it. Named
 * after the notifications it used to clean, and deliberately left that way: the settings it
 * reads (`notification_retention_*`) are stored values.
 */
const job = new ScheduledJob({
    id: "notification-cleanup",
    intervalMs: () => readConfig().intervalHours * 60 * 60 * 1000,
});

export class NotificationCleanupService {
    static run(trigger: SchedulerTrigger = "schedule"): Promise<NotificationCleanupResult> {
        return job.run(trigger, () => {
            const { ttlDays, minKeep, updatesTtlDays, updatesMinKeep } = readConfig();
            const removed = ActivityRepository.cleanupOld(ttlDays, minKeep);
            const updatesRemoved = ContainerUpdateRepository.cleanupOld(updatesTtlDays, updatesMinKeep);
            logger.info(
                { removed, ttlDays, minKeep, updatesRemoved, updatesTtlDays, updatesMinKeep },
                "Notification cleanup completed",
            );
            return { removed, updatesRemoved };
        });
    }

    static startScheduler(): void {
        job.start(() => this.run("schedule"));
    }

    static stopScheduler(): void {
        job.stop();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): SchedulerStatus<"notification-cleanup"> {
        return job.status();
    }
}
