import { describe, expect, it } from "vitest";
import type { ActivityRecord, SchedulerStatuses } from "@dim/shared";
import { check, client, container, dockerState, image, offline } from "../../../lib/fleet.testdata";
import { problemTone, unseenProblems } from "../../activity/lib/unseenTone";
import { buildContainerGroups } from "../../containers/lib/containerGroups";
import {
    clientCount,
    containerCount,
    formatOnlineCount,
    ATTENTION_LIMIT,
    needsAttention,
    nextSchedulerRun,
    notRunning,
    notRunningReading,
    problemSummary,
    updatesAvailable,
    updatesOnOfflineHosts,
    updatesReading,
} from "./dashboard";
import { ROUTES, containersFiltered, paths } from "../../../lib/paths";

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

describe("the cards' readings", () => {
    it("says how many of the updates sit on hosts that are offline", () => {
        expect(updatesOnOfflineHosts(groups)).toBe(1);
        expect(updatesReading(groups)).toEqual({ value: "3", sub: "1 on offline clients" });
    });

    it("names the fleet where every update can be acted on", () => {
        const online = groups.map((g) => ({ ...g, children: g.children?.filter((i) => i.clientOnline) }));
        expect(updatesReading(online)).toEqual({ value: "2", sub: "Across 3 containers" });
    });

    it("shows the count of stopped containers while a client is online", () => {
        expect(notRunningReading(groups, clientCount(clients))).toEqual({
            value: "1",
            sub: "On clients that are online",
        });
    });

    it("shows no number while no client is online: a zero would say that everything runs", () => {
        expect(notRunningReading(groups, { online: 0, total: 3 })).toEqual({ value: "–", sub: "No client is online" });
    });
});

describe("needsAttention", () => {
    const error = (id: string, over: Partial<ActivityRecord> = {}) =>
        ({ id, kind: "action.failed", level: "error", seen: false, occurredAt: "2026-10-04T10:00:00Z", ...over }) as ActivityRecord;

    it("lists what the cards count, each row with the way to its page", () => {
        const [offlineClients, updates, errors] = needsAttention({ clients, groups, events: [error("e1")] });

        expect(offlineClients.items.map((i) => i.to)).toEqual([paths.client("h3")]);
        expect(offlineClients.to).toBe(ROUTES.clients);

        expect(updates.items).toHaveLength(updatesAvailable(groups));
        expect(updates.to).toEqual(containersFiltered({ update: "update" }));
        // The host that is offline comes last: nothing can be done there.
        expect(updates.items.map((i) => i.detail?.endsWith("(offline)"))).toEqual([false, false, true]);

        expect(errors.items.map((i) => i.key)).toEqual(["e1"]);
    });

    it("leaves out a group with nothing in it", () => {
        expect(needsAttention({ clients: [client("h1")], groups: [], events: [] })).toEqual([]);
    });

    it("lists neither a warning nor an error that has been seen", () => {
        const events = [error("e1", { seen: true }), error("e2", { level: "warning" })];
        expect(needsAttention({ clients: [], groups: [], events })).toEqual([]);
    });

    it("stops after a few rows and says how many are left", () => {
        const events = Array.from({ length: ATTENTION_LIMIT + 2 }, (_, i) => error(`e${i}`));
        const [errors] = needsAttention({ clients: [], groups: [], events });
        expect(errors.items).toHaveLength(ATTENTION_LIMIT);
        expect(errors.more).toBe(2);
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
