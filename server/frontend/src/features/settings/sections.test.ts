import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SECTIONS, isDirty, sectionBody, sectionError, settingsFrom } from "./sections";

const section = (id: string) => SECTIONS.find((s) => s.id === id)!;

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

describe("sectionBody", () => {
    it("holds the section's own keys and no others", () => {
        const tokens = section("tokens");
        expect(Object.keys(sectionBody(tokens, DEFAULT_SETTINGS)).sort()).toEqual([...tokens.keys].sort());
    });
});

describe("sectionError", () => {
    it("has nothing to say about the defaults", () => {
        for (const s of SECTIONS) expect(sectionError(s, DEFAULT_SETTINGS)).toBeNull();
    });

    it("names the key and the server's reason for a value it would refuse", () => {
        const draft = { ...DEFAULT_SETTINGS, token_retention_days: "soon" };
        expect(sectionError(section("tokens"), draft)).toBe("token_retention_days: Must be a whole number");
    });

    it("does not report another section's value", () => {
        const draft = { ...DEFAULT_SETTINGS, token_retention_days: "soon" };
        expect(sectionError(section("activity"), draft)).toBeNull();
    });
});

describe("isDirty", () => {
    it("is per section", () => {
        const draft = { ...DEFAULT_SETTINGS, token_retention_days: "7" };
        expect(isDirty(section("tokens"), draft, DEFAULT_SETTINGS)).toBe(true);
        expect(isDirty(section("activity"), draft, DEFAULT_SETTINGS)).toBe(false);
    });
});
