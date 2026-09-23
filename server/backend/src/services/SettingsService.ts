import type { AppConfig } from "../config/AppConfig.js";
import { appConfig, updateConfig } from "../config/AppConfig.js";
import { logger } from "@dim/shared/node";
import { ImageUpdateCacheCleanupService } from "./ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "./ImageUpdateCheckSchedulerService.js";
import { AutoUpdatePolicyService } from "./AutoUpdatePolicyService.js";
import { NotificationCleanupService } from "./NotificationCleanupService.js";
import { TokenCleanupService } from "./TokenCleanupService.js";
import { ProxyService } from "./ProxyService.js";
import { WS_EVENTS } from "@dim/shared";

const IMAGE_VERSION_CACHE_KEYS = new Set([
    "image_version_cache_ttl_days",
    "image_version_cache_cleanup_orphans",
    "image_version_cache_cleanup_interval_hours",
]);

const IMAGE_UPDATE_CHECK_KEYS = new Set([
    "image_update_check_interval_seconds",
]);

const CONTAINER_AUTO_UPDATE_LABEL_KEY = "container_auto_update_label";

/**
 * Everything the auto-update policy is built from. A change to any of them has to reach
 * every connected agent: the agents hold the policy and act on it on their own, so a
 * setting that stayed on the server would simply not take effect.
 */
const AUTO_UPDATE_POLICY_KEYS = new Set([
    "container_auto_update_cron",
    CONTAINER_AUTO_UPDATE_LABEL_KEY,
    "container_auto_update_delay_label",
]);

const TOKEN_CLEANUP_KEYS = new Set([
    "token_retention_days",
    "token_cleanup_interval_hours",
]);

const NOTIFICATION_CLEANUP_KEYS = new Set([
    "notification_retention_days",
    "notification_retention_count",
    "notification_cleanup_interval_hours",
]);

/**
 * The container lists read the label to show what carries it, so a changed label has to
 * reach them without a reload.
 */
function broadcastAutoUpdateLabel() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.AUTO_UPDATE_LABEL_UPDATE,
        payload: {
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
    /**
     * One setting as a string. The known keys arrive as strings from AppConfigSchema; a key
     * added by hand is whatever YAML made of it, so a number or boolean is levelled out here
     * and anything structured is not a value to coerce.
     */
    static getSetting(key: string): string | null {
        try {
            const value = appConfig.settings[key];
            if (value === undefined || value === null || value === "") return null;
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            logger.warn({ key }, "Setting is not a scalar value, ignoring it");
            return null;
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

            if (
                previousSettings[CONTAINER_AUTO_UPDATE_LABEL_KEY] !==
                newSettings[CONTAINER_AUTO_UPDATE_LABEL_KEY]
            ) {
                broadcastAutoUpdateLabel();
            }

            const policyChanged = [...AUTO_UPDATE_POLICY_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (policyChanged) {
                AutoUpdatePolicyService.broadcast();
            }

            const notificationCleanupChanged = [...NOTIFICATION_CLEANUP_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (notificationCleanupChanged) {
                NotificationCleanupService.restartScheduler();
            }

            const tokenCleanupChanged = [...TOKEN_CLEANUP_KEYS].some(
                (key) => previousSettings[key] !== newSettings[key],
            );
            if (tokenCleanupChanged) {
                TokenCleanupService.restartScheduler();
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to update settings");
            throw e;
        }
    }
}
