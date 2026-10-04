import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { check, client, container, dockerState, image, offline } from "../../../lib/fleet.testdata";
import { problemTone, unseenProblems } from "../../activity/lib/unseenTone";
import { buildContainerGroups } from "../../containers/lib/containerGroups";
import {
    clientCount,
    containerCount,
    formatOnlineCount,
    notRunning,
    notRunningReading,
    problemSummary,
    updatesAvailable,
    updatesOnOfflineHosts,
    updatesReading,
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
