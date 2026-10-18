import { describe, expect, it } from "vitest";
import { nextDockerHealth } from "./DockerHealth.js";

const T1 = new Date("2026-10-18T10:00:00.000Z");
const T2 = new Date("2026-10-18T10:05:00.000Z");

describe("nextDockerHealth", () => {
    it("starts with the first answer and its time", () => {
        expect(nextDockerHealth(null, { ok: true }, T1)).toEqual({
            reachable: true,
            error: null,
            since: T1.toISOString(),
        });
    });

    it("hands back the same object when nothing changed", () => {
        const first = nextDockerHealth(null, { ok: true }, T1);

        expect(nextDockerHealth(first, { ok: true }, T2)).toBe(first);
    });

    it("moves `since` when the answer flips", () => {
        const up = nextDockerHealth(null, { ok: true }, T1);

        expect(nextDockerHealth(up, { ok: false, error: "ENOENT" }, T2)).toEqual({
            reachable: false,
            error: "ENOENT",
            since: T2.toISOString(),
        });
    });

    it("keeps `since` while it keeps failing, with the newest message", () => {
        const down = nextDockerHealth(null, { ok: false, error: "ENOENT" }, T1);
        const still = nextDockerHealth(down, { ok: false, error: "ECONNREFUSED" }, T2);

        expect(still).toEqual({ reachable: false, error: "ECONNREFUSED", since: T1.toISOString() });
        expect(nextDockerHealth(still, { ok: false, error: "ECONNREFUSED" }, T2)).toBe(still);
    });
});
