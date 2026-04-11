import { appConfig, updateConfig } from "../config/AppConfig.js";
import { ImageUpdateCacheCleanupService } from "./ImageUpdateCacheCleanupService.js";

const IMAGE_VERSION_CACHE_KEYS = new Set([
    "image_version_cache_ttl_days",
    "image_version_cache_cleanup_orphans",
    "image_version_cache_cleanup_interval_hours",
]);

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
        } catch (e) {
            console.error("Failed to update settings:", e);
            throw e;
        }
    }
}
