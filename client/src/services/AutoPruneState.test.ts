import { describe, expect, it } from "vitest";
import { EMPTY_PRUNE_STATE, pruneSummary, readPruneState } from "./AutoPruneState.js";

describe("readPruneState", () => {
    it("reads what was stored", () => {
        expect(
            readPruneState({ cron: "0 4 * * *", nextRun: "2026-10-29T04:00:00.000Z", lastRun: "2026-10-28T04:00:03.000Z" }),
        ).toEqual({ cron: "0 4 * * *", nextRun: "2026-10-29T04:00:00.000Z", lastRun: "2026-10-28T04:00:03.000Z" });
    });

    it("starts empty without a file, or with one that is not an object", () => {
        expect(readPruneState(null)).toEqual(EMPTY_PRUNE_STATE);
        expect(readPruneState([])).toEqual(EMPTY_PRUNE_STATE);
        expect(readPruneState("0 4 * * *")).toEqual(EMPTY_PRUNE_STATE);
    });

    it("drops a damaged field and keeps the others", () => {
        expect(readPruneState({ cron: 4, nextRun: "soon", lastRun: "2026-10-28T04:00:03.000Z" })).toEqual({
            cron: "",
            nextRun: null,
            lastRun: "2026-10-28T04:00:03.000Z",
        });
    });
});

describe("pruneSummary", () => {
    it("reports the times in UTC ISO form", () => {
        const state = { cron: "0 4 * * *", nextRun: "2026-10-29T05:00:00+01:00", lastRun: null };
        expect(pruneSummary(state, "2026-10-28T04:00:00.000Z")).toEqual({
            lastRun: null,
            nextRun: "2026-10-29T04:00:00.000Z",
            runningSince: "2026-10-28T04:00:00.000Z",
        });
    });

    it("reports nothing for a host that never pruned on its own", () => {
        expect(pruneSummary(EMPTY_PRUNE_STATE, null)).toEqual({ lastRun: null, nextRun: null, runningSince: null });
    });
});
