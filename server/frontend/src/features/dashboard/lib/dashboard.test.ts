import { describe, expect, it } from "vitest";
import type { ActivityRecord, SchedulerStatuses } from "@dim/shared";
import { check, client, container, dockerState, image, offline } from "../../../lib/fleet.testdata";
import { problemTone, unseenProblems } from "../../activity/lib/unseenTone";
import { buildContainerGroups } from "../../containers/lib/containerGroups";
import {
    clientCount,
    containerCount,
    formatOnlineCount,
    nextSchedulerRun,
    notRunning,
    problemSummary,
    updatesAvailable,
} from "./dashboard";

const clients = [client("h1"), client("h2"), offline("h3")];

const groups = buildContainerGroups({
    clients,
    dockerStates: {
        h1: dockerState(
            [container(), container({ id: "c2", names: ["/db"], state: "exited" })],
            [image({ updateCheck: check(true) })],
        ),
        h2: dockerState([container({ id: "c3" })], [image({ updateCheck: check(false) })]),
        h3: dockerState([container({ id: "c4", state: "exited" })], [image({ updateCheck: check(true) })]),
    },
    assignment: new Map(),
    labelFilter: null,
});

describe("clientCount", () => {
    it("counts the connected clients among all of them", () => {
        expect(clientCount(clients)).toEqual({ online: 2, total: 3 });
        expect(formatOnlineCount(clientCount(clients))).toBe("2 / 3");
        expect(formatOnlineCount(clientCount([]))).toBe("0 / 0");
    });
});

describe("the container counts", () => {
    it("counts a container once per host it sits on", () => {
        expect(containerCount(groups)).toBe(4);
    });

    it("counts every host's copy that is behind, also on a host that is offline", () => {
        // `db` on h1 runs the same image, so it is behind with it.
        expect(updatesAvailable(groups)).toBe(3);
    });

    it("does not count a stopped container on a host that is offline", () => {
        expect(notRunning(groups)).toBe(1);
    });

    it("is zero for an empty fleet", () => {
        expect([containerCount([]), updatesAvailable([]), notRunning([])]).toEqual([0, 0, 0]);
    });
});

const event = (over: Partial<ActivityRecord>): ActivityRecord =>
    ({ id: "e1", level: "info", seen: false, ...over }) as ActivityRecord;

describe("unseenProblems", () => {
    it("counts what asks for a look and has not been seen", () => {
        const problems = unseenProblems([
            event({ id: "e1", level: "error" }),
            event({ id: "e2", level: "error", seen: true }),
            event({ id: "e3", level: "warning" }),
            event({ id: "e4", level: "warning" }),
            event({ id: "e5", level: "info" }),
        ]);
        expect(problems).toEqual({ errors: 1, warnings: 2 });
        expect(problemSummary(problems)).toBe("1 error · 2 warnings");
        expect(problemTone(problems)).toBe("error");
    });

    it("has a tone only where there is something to look at", () => {
        expect(problemTone({ errors: 0, warnings: 3 })).toBe("warning");
        expect(problemTone({ errors: 0, warnings: 0 })).toBeNull();
        expect(problemSummary({ errors: 0, warnings: 0 })).toBe("Nothing to report");
        expect(problemSummary({ errors: 0, warnings: 1 })).toBe("1 warning");
    });
});

describe("nextSchedulerRun", () => {
    const status = (nextRun: string | null) => ({ isRunning: false, nextRun, lastRun: null });

    it("takes the run that comes first", () => {
        const statuses = {
            "image-update-check": { ...status("2026-10-04T12:00:00Z"), registries: [] },
            "image-cache-cleanup": status("2026-10-04T09:30:00Z"),
            "notification-cleanup": status(null),
            "token-cleanup": status("2026-10-05T00:00:00Z"),
        } satisfies SchedulerStatuses;
        expect(nextSchedulerRun(statuses)).toEqual({ scheduler: "image-cache-cleanup", at: "2026-10-04T09:30:00Z" });
    });

    it("has none while every scheduler is switched off, or none is known", () => {
        expect(nextSchedulerRun({ "token-cleanup": status(null) })).toBeNull();
        expect(nextSchedulerRun({})).toBeNull();
    });
});
