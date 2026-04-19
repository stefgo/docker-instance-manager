import { appConfig, updateConfig } from "../config/AppConfig.js";
import { ImageUpdateCacheCleanupService } from "./ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "./ImageUpdateCheckSchedulerService.js";
import { ContainerAutoUpdateSchedulerService } from "./ContainerAutoUpdateSchedulerService.js";
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

function broadcastManualUpdate() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.MANUAL_AUTO_UPDATE_UPDATE,
        payload: {
            entries: ContainerAutoUpdateRepository.list(),
            labelFilter: (appConfig.settings[CONTAINER_AUTO_UPDATE_LABEL_KEY] ?? "").trim(),
        },
    });
}

export class SettingsService {
    static getSetting(key: string): string | null {
        try {
            return appConfig.settings[key] || null;
        } catch (e) {
            console.error(`Failed to get setting ${key}:`, e);
            return null;
        }
    }

    static getAllSettings(): Record<string, any> {
        try {
            return {
                ...appConfig.settings,
                security: appConfig.security,
            };
        } catch (e) {
            console.error("Failed to get all settings:", e);
            return {};
        }
    }

    static updateSetting(key: string, value: string): void {
        try {
            const previous = appConfig.settings[key];
            const newSettings = { ...appConfig.settings, [key]: value };
            updateConfig({ settings: newSettings });
            if (IMAGE_VERSION_CACHE_KEYS.has(key) && previous !== value) {
                ImageUpdateCacheCleanupService.restartScheduler();
            }
            if (IMAGE_UPDATE_CHECK_KEYS.has(key) && previous !== value) {
                ImageUpdateCheckSchedulerService.restartScheduler();
            }
            if (CONTAINER_AUTO_UPDATE_KEYS.has(key) && previous !== value) {
                ContainerAutoUpdateSchedulerService.restartScheduler();
            }
            if (key === CONTAINER_AUTO_UPDATE_LABEL_KEY && previous !== value) {
                broadcastManualUpdate();
            }
        } catch (e) {
            console.error(`Failed to update setting ${key}:`, e);
            throw e;
        }
    }

    static updateSettings(settings: Record<string, any>): void {
        try {
            const { security, ...rest } = settings;
            const previousSettings = { ...appConfig.settings };
            const newSettings = { ...appConfig.settings, ...rest };

            const updates: any = { settings: newSettings };
            if (security) {
                updates.security = security;
            }

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
        } catch (e) {
            console.error("Failed to update settings:", e);
            throw e;
        }
    }
}
