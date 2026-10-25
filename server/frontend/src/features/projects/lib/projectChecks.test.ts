import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "../../images/lib/updateStatus";
import { isCheckable, planCheck, shownSelection } from "./projectChecks";

const target = (imageRef: string, repoDigests: string[], updateStatus: UpdateStatus = "current") => ({
    imageRef,
    repoDigests,
    updateStatus,
});

const row = (id: string, ...targets: ReturnType<typeof target>[]) => ({ id, live: { targets } });

describe("isCheckable", () => {
    it("needs an image a registry can be asked about", () => {
        expect(isCheckable(row("a", target("nginx", [], "none")))).toBe(false);
        expect(isCheckable(row("a", target("nginx", [], "none"), target("redis", ["d1"])))).toBe(true);
        expect(isCheckable(row("a"))).toBe(false);
    });
});

describe("planCheck", () => {
    it("asks once per reference, with the digests of every project that runs it", () => {
        const { count, checks } = planCheck([
            row("a", target("nginx", ["d1"])),
            row("b", target("nginx", ["d1", "d2"]), target("redis", ["d3"], "update")),
        ]);
        expect(count).toBe(2);
        expect(checks).toEqual([
            { imageRef: "nginx", repoDigests: ["d1", "d2"] },
            { imageRef: "redis", repoDigests: ["d3"] },
        ]);
    });

    it("counts only the projects it reaches and leaves images out that cannot be checked", () => {
        const { count, checks } = planCheck([row("a", target("local", [], "none")), row("b", target("redis", ["d3"]))]);
        expect(count).toBe(1);
        expect(checks).toEqual([{ imageRef: "redis", repoDigests: ["d3"] }]);
    });
});

describe("shownSelection", () => {
    it("drops a pick the list no longer shows", () => {
        expect([...shownSelection([{ id: "a" }, { id: "b" }], new Set(["b", "gone"]))]).toEqual(["b"]);
    });
});
