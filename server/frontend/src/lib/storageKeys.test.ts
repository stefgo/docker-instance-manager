import { describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "./storageKeys";

describe("STORAGE_KEYS", () => {
    const keys = Object.values(STORAGE_KEYS);

    it("names every value once", () => {
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("writes every key as dim.<area>.<what>", () => {
        for (const key of keys) expect(key).toMatch(/^dim\.[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/);
    });
});
