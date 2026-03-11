import { appConfig, updateConfig } from "../config/AppConfig.js";

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
            const newSettings = { ...appConfig.settings, [key]: value };
            updateConfig({ settings: newSettings });
        } catch (e) {
            console.error(`Failed to update setting ${key}:`, e);
            throw e;
        }
    }

    static updateSettings(settings: Record<string, any>): void {
        try {
            const { security, ...rest } = settings;
            const newSettings = { ...appConfig.settings, ...rest };

            const updates: any = { settings: newSettings };
            if (security) {
                updates.security = security;
            }

            updateConfig(updates);
        } catch (e) {
            console.error("Failed to update settings:", e);
            throw e;
        }
    }
}
