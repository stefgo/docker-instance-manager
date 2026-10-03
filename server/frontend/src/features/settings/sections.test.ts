import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settingsFrom } from "./sections";

describe("settingsFrom", () => {
    it("keeps the defaults for what the server does not name", () => {
        expect(settingsFrom({})).toEqual(DEFAULT_SETTINGS);
    });

    it("takes a value the UI saved as it is", () => {
        expect(settingsFrom({ token_retention_days: "7" }).token_retention_days).toBe("7");
    });

    // config.yaml edited by hand: YAML reads `30` and `true` without quotes as what they are.
    it("reads a number and a boolean as text", () => {
        const values = settingsFrom({ token_retention_days: 7, image_version_cache_cleanup_orphans: false });
        expect(values.token_retention_days).toBe("7");
        expect(values.image_version_cache_cleanup_orphans).toBe("false");
    });

    it("leaves out what is not a single value", () => {
        const values = settingsFrom({ security: { hsts: true }, container_auto_update_cron: null });
        expect(values).not.toHaveProperty("security");
        expect(values.container_auto_update_cron).toBe(DEFAULT_SETTINGS.container_auto_update_cron);
    });
});
