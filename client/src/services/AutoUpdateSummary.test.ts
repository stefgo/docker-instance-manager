import { describe, expect, it } from "vitest";
import { schedulePlans, scheduleSummary } from "./AutoUpdateSummary.js";

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

describe("schedulePlans", () => {
    it("reports each schedule with its expression and next run, sorted by name", () => {
        const plans = schedulePlans({
            "project:b": { cron: "0 4 * * *", nextRun: "2026-10-21T04:00:00.000Z" },
            host: { cron: "0 3 * * *", nextRun: "2026-10-21T03:00:00.000Z" },
            "project:a": { cron: "0 5 * * 0", nextRun: null },
        });

        expect(plans).toEqual([
            { schedule: "host", cron: "0 3 * * *", nextRun: "2026-10-21T03:00:00.000Z" },
            { schedule: "project:a", cron: "0 5 * * 0", nextRun: null },
            { schedule: "project:b", cron: "0 4 * * *", nextRun: "2026-10-21T04:00:00.000Z" },
        ]);
    });

    it("answers in UTC and sends a time that does not parse as none", () => {
        const plans = schedulePlans({
            host: { cron: "0 3 * * *", nextRun: "2026-10-21T05:00:00+02:00" },
            "project:a": { cron: "0 3 * * *", nextRun: "tomorrow" },
        });

        expect(plans.map((p) => p.nextRun)).toEqual(["2026-10-21T03:00:00.000Z", null]);
    });

    it("says nothing for a host without schedules", () => {
        expect(schedulePlans({})).toEqual([]);
    });
});
