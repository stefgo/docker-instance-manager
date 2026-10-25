import { describe, expect, it } from "vitest";
import type { SchedulerRunSummary } from "@dim/shared";
import { describeRunResult } from "./runResult";

const run = (result: SchedulerRunSummary<"notification-cleanup">["result"]): SchedulerRunSummary<"notification-cleanup"> => ({
    trigger: "schedule",
    status: "success",
    startedAt: "2026-10-25T03:00:00.000Z",
    finishedAt: "2026-10-25T03:00:01.000Z",
    result,
    error: null,
});

describe("describeRunResult: the activity cleanup", () => {
    it("counts the events and the updates it removed", () => {
        expect(describeRunResult("notification-cleanup", run({ removed: 3, updatesRemoved: 1 }))).toBe(
            "3 events and 1 update removed",
        );
    });

    // Recorded before the update history existed.
    it("counts the events alone for a run that knew no updates", () => {
        expect(describeRunResult("notification-cleanup", run({ removed: 3 }))).toBe("3 removed");
    });
});
