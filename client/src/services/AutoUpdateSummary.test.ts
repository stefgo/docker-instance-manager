import { describe, expect, it } from "vitest";
import { scheduleSummary } from "./AutoUpdateSummary.js";

describe("scheduleSummary", () => {
    it("takes the newest finished run and the earliest planned one", () => {
        const summary = scheduleSummary([
            { lastRun: "2026-10-16T03:00:00.000Z", nextRun: "2026-10-19T03:00:00.000Z", startedAt: null },
            { lastRun: "2026-10-17T04:30:00.000Z", nextRun: "2026-10-18T04:30:00.000Z", startedAt: null },
            { lastRun: "2026-10-15T02:00:00.000Z", nextRun: "2026-10-20T02:00:00.000Z", startedAt: null },
        ]);

        expect(summary).toEqual({
            lastRun: "2026-10-17T04:30:00.000Z",
            nextRun: "2026-10-18T04:30:00.000Z",
            runningSince: null,
        });
    });

    it("says none for a host without schedules", () => {
        expect(scheduleSummary([])).toEqual({ lastRun: null, nextRun: null, runningSince: null });
    });

    it("reads past a schedule that has not run yet or has nothing planned", () => {
        const summary = scheduleSummary([
            { lastRun: null, nextRun: "2026-10-18T03:00:00.000Z", startedAt: null },
            { lastRun: "2026-10-17T03:00:00.000Z", nextRun: null, startedAt: null },
        ]);

        expect(summary).toEqual({
            lastRun: "2026-10-17T03:00:00.000Z",
            nextRun: "2026-10-18T03:00:00.000Z",
            runningSince: null,
        });
    });

    it("says since when a run is under way, the earliest of several", () => {
        const summary = scheduleSummary([
            { lastRun: null, nextRun: null, startedAt: "2026-10-18T03:02:00.000Z" },
            { lastRun: null, nextRun: null, startedAt: "2026-10-18T03:00:00.000Z" },
            { lastRun: null, nextRun: null, startedAt: null },
        ]);

        expect(summary.runningSince).toBe("2026-10-18T03:00:00.000Z");
    });

    it("compares instants rather than strings and answers in UTC", () => {
        const summary = scheduleSummary([
            { lastRun: "2026-10-17T05:00:00+02:00", nextRun: null, startedAt: null },
            { lastRun: "2026-10-17T03:30:00.000Z", nextRun: null, startedAt: null },
        ]);

        expect(summary.lastRun).toBe("2026-10-17T03:30:00.000Z");
    });

    it("counts a stored value that does not parse as none", () => {
        const summary = scheduleSummary([{ lastRun: "yesterday", nextRun: "", startedAt: "soon" }]);

        expect(summary).toEqual({ lastRun: null, nextRun: null, runningSince: null });
    });
});
