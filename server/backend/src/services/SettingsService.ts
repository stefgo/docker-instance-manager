import type { AppConfig } from "../config/AppConfig.js";
import { appConfig, updateConfig } from "../config/AppConfig.js";
import { logger } from "@dim/shared/node";
import { ImageUpdateCacheCleanupService } from "./ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "./ImageUpdateCheckSchedulerService.js";
import { ContainerAutoUpdateSchedulerService } from "./ContainerAutoUpdateSchedulerService.js";
import { NotificationCleanupService } from "./NotificationCleanupService.js";
import { ProxyService } from "./ProxyService.js";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { WS_EVENTS } from "@dim/shared";

const IMAGE_VERSION_CACHE_KEYS = new Set([
    "image_version_cache_ttl_days",
    "image_version_cache_cleanup_orphans",
    "image_version_cache_cleanup_interval_hours",
]);

const IMAGE_UPDATE_CHECK_KEYS = new Set([
    "image_update_check_interval_seconds",
]);

const CONTAINER_AUTO_UPDATE_KEYS = new Set([
    "container_auto_update_cron",
]);

const CONTAINER_AUTO_UPDATE_LABEL_KEY = "container_auto_update_label";

const NOTIFICATION_CLEANUP_KEYS = new Set([
    "notification_retention_days",
    "notification_retention_count",
    "notification_cleanup_interval_hours",
]);

function broadcastManualUpdate() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.MANUAL_AUTO_UPDATE_UPDATE,
        payload: {
            entries: ContainerAutoUpdateRepository.list(),
            labelFilter: (appConfig.settings[CONTAINER_AUTO_UPDATE_LABEL_KEY] ?? "").trim(),
        },
    });
}

/**
 * Reads and writes the operator-facing part of `config.yaml`: the `settings` block. The
 * remaining keys in that file -- `security`, `jwtSecret`, the OIDC credentials -- are startup
 * configuration and deliberately have no API surface.
 */
export class SettingsService {
    static getSetting(key: string): string | null {
        try {
            return appConfig.settings[key] || null;
        } catch (e) {
            logger.error({ err: e, key }, "Failed to get setting");
            return null;
        }
    }

    /**
     * Everything the settings page shows. `security` used to be returned alongside, and the
     * page sent it back unchanged on every save; it is config.yaml-only now.
     */
    static getAllSettings(): Record<string, unknown> {
        try {
            return { ...appConfig.settings };
        } catch (e) {
            logger.error({ err: e }, "Failed to get all settings");
            return {};
        }
    }

    /**
     * Merges already validated settings into the `settings` block. `security` never arrives
     * here: CleanupSettingsSchema rejects it.
     */
    static updateSettings(settings: Record<string, unknown>): void {
        try {
            const previousSettings = { ...appConfig.settings };
            const newSettings = {
                ...appConfig.settings,
                ...(settings as Record<string, string>),
            };

            const updates: Partial<AppConfig> = { settings: newSettings };

            updateConfig(updates);

            const imageCacheChanged = [...IMAGE_VERSION_CACHE_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (imageCacheChanged) {
                ImageUpdateCacheCleanupService.restartScheduler();
            }

            const imageCheckChanged = [...IMAGE_UPDATE_CHECK_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (imageCheckChanged) {
                ImageUpdateCheckSchedulerService.restartScheduler();
            }

            const containerAutoUpdateChanged = [...CONTAINER_AUTO_UPDATE_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (containerAutoUpdateChanged) {
                ContainerAutoUpdateSchedulerService.restartScheduler();
            }

            if (
                previousSettings[CONTAINER_AUTO_UPDATE_LABEL_KEY] !==
                newSettings[CONTAINER_AUTO_UPDATE_LABEL_KEY]
            ) {
                broadcastManualUpdate();
            }

            const notificationCleanupChanged = [...NOTIFICATION_CLEANUP_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (notificationCleanupChanged) {
                NotificationCleanupService.restartScheduler();
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to update settings");
            throw e;
        }
    }
}
