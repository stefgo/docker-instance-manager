import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { groupActivity, lifecycleTitle, splitRuns, supersededIds } from "./groupActivity";

let clock = 0;

/** Events are created oldest first; the lists under test are newest first, as the API sends them. */
const event = (id: string, kind: string, over: Partial<ActivityRecord> = {}): ActivityRecord => {
    clock += 1;
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString();
    return {
        id,
        kind,
        occurredAt: at,
        receivedAt: at,
        source: "agent",
        clientId: "h1",
        level: "info",
        seen: true,
        ...over,
    };
};

const newestFirst = (...events: ActivityRecord[]) => [...events].reverse();

describe("supersededIds", () => {
    it("is empty while nothing is settled", () => {
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a" });
        expect(supersededIds([pending]).size).toBe(0);
    });

    it("names the unconfirmed event once the agent's own outcome has arrived", () => {
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a" });
        const done = event("d", "action.completed", { correlationId: "a" });
        expect([...supersededIds(newestFirst(pending, done))]).toEqual(["u"]);
    });

    it("does not depend on which of the two arrived first", () => {
        const done = event("d", "action.failed", { correlationId: "a" });
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a" });
        expect([...supersededIds(newestFirst(done, pending))]).toEqual(["u"]);
    });

    it("is not settled by the server's own record of a failure", () => {
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a" });
        const failed = event("f", "action.failed", { source: "server", correlationId: "a" });
        expect(supersededIds(newestFirst(pending, failed)).size).toBe(0);
    });

    it("keeps to its own correlation", () => {
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a" });
        const other = event("d", "action.completed", { correlationId: "b" });
        expect(supersededIds(newestFirst(pending, other)).size).toBe(0);
    });
});

describe("groupActivity", () => {
    it("makes an event without a correlation a row of its own", () => {
        const a = event("a", "container.started");
        const b = event("b", "container.stopped", { level: "warning", seen: false });
        expect(groupActivity(newestFirst(a, b))).toEqual([
            { head: b, members: [], level: "warning", unseen: true, superseded: [] },
            { head: a, members: [], level: "info", unseen: false, superseded: [] },
        ]);
    });

    it("folds correlated events into one row headed by the summarising event", () => {
        const pulled = event("p", "image.pulled", { correlationId: "run" });
        const started = event("s", "container.started", { correlationId: "run" });
        const run = event("r", "autoupdate.run", { correlationId: "run" });
        const [group, ...rest] = groupActivity(newestFirst(pulled, started, run));
        expect(rest).toEqual([]);
        expect(group.head).toBe(run);
        // Oldest first, the way the run went.
        expect(group.members).toEqual([pulled, started]);
    });

    it("lets the earliest member stand in while the head has not arrived", () => {
        const pulled = event("p", "image.pulled", { correlationId: "run" });
        const started = event("s", "container.started", { correlationId: "run" });
        const [group] = groupActivity(newestFirst(pulled, started));
        expect(group.head).toBe(pulled);
        expect(group.members).toEqual([started]);
    });

    it("colours the group by its most severe member", () => {
        const request = event("q", "action.requested", { source: "server", correlationId: "a" });
        const failed = event("f", "action.failed", { correlationId: "a", level: "error" });
        expect(groupActivity(newestFirst(request, failed))[0].level).toBe("error");
    });

    it("is unseen while any member is", () => {
        const request = event("q", "action.requested", { source: "server", correlationId: "a" });
        const done = event("d", "action.completed", { correlationId: "a", seen: false });
        expect(groupActivity(newestFirst(request, done))[0].unseen).toBe(true);
        expect(groupActivity(newestFirst(request, { ...done, seen: true }))[0].unseen).toBe(false);
    });

    it("keeps a group at the position of its newest member", () => {
        const request = event("q", "action.requested", { source: "server", correlationId: "a" });
        const between = event("x", "container.started");
        const done = event("d", "action.completed", { correlationId: "a" });
        const newer = event("y", "container.stopped");
        expect(groupActivity(newestFirst(request, between, done, newer)).map((g) => g.head.id)).toEqual([
            "y",
            "q",
            "x",
        ]);
    });

    it("leaves a superseded event out of the row, but hands it over to be seen with it", () => {
        const request = event("q", "action.requested", { source: "server", correlationId: "a" });
        const pending = event("u", "action.unconfirmed", {
            source: "server",
            correlationId: "a",
            level: "warning",
            seen: false,
        });
        const done = event("d", "action.completed", { correlationId: "a" });
        const [group] = groupActivity(newestFirst(request, pending, done));
        expect(group.members).toEqual([done]);
        expect(group.superseded).toEqual([pending]);
        // "Result pending" is no longer true, so it colours neither the row nor the badge.
        expect(group.level).toBe("info");
        expect(group.unseen).toBe(false);
    });

    it("still shows an unconfirmed action nothing has settled", () => {
        const request = event("q", "action.requested", { source: "server", correlationId: "a" });
        const pending = event("u", "action.unconfirmed", { source: "server", correlationId: "a", level: "warning" });
        const [group] = groupActivity(newestFirst(request, pending));
        expect(group.members).toEqual([pending]);
        expect(group.level).toBe("warning");
        expect(group.superseded).toEqual([]);
    });

    it("gives no rows for no events", () => {
        expect(groupActivity([])).toEqual([]);
    });
});

describe("groupActivity, lifecycle bursts", () => {
    const web = { subject: { containerName: "web" } };
    /** A recreate as Docker reports it: the old container goes, a new one comes. */
    const recreate = (prefix = "") => [
        event(`${prefix}1`, "container.stopped", web),
        event(`${prefix}2`, "container.died", web),
        event(`${prefix}3`, "container.removed", web),
        event(`${prefix}4`, "container.created", web),
        event(`${prefix}5`, "container.started", web),
    ];

    it("folds a recreate into one row with every step below it", () => {
        const steps = recreate();
        const [group, ...rest] = groupActivity(newestFirst(...steps));
        expect(rest).toEqual([]);
        expect(group.title).toBe("Container web recreated");
        expect([group.head, ...group.members]).toEqual(steps);
    });

    it("colours the row by its worst step and is unseen while any step is", () => {
        const died = event("d", "container.died", { ...web, level: "warning", seen: false });
        const started = event("s", "container.started", web);
        const [group] = groupActivity(newestFirst(died, started));
        expect(group.title).toBe("Container web restarted");
        expect(group.level).toBe("warning");
        expect(group.unseen).toBe(true);
    });

    it("keeps two bursts of the same container apart", () => {
        const first = recreate("a");
        clock += 60;
        const second = recreate("b");
        const groups = groupActivity(newestFirst(...first, ...second));
        expect(groups.map((g) => g.head.id)).toEqual(["b1", "a1"]);
    });

    it("keeps the containers of one recreate apart, however their events interleave", () => {
        const a = event("a1", "container.stopped", web);
        const b = event("b1", "container.stopped", { subject: { containerName: "db" } });
        const a2 = event("a2", "container.started", web);
        const b2 = event("b2", "container.started", { subject: { containerName: "db" } });
        const groups = groupActivity(newestFirst(a, b, a2, b2));
        expect(groups.map((g) => g.title)).toEqual(["Container db restarted", "Container web restarted"]);
    });

    it("makes a crash loop one row per run, newest first, below the restart that began it", () => {
        const exit1 = { ...web, data: { exitCode: 1 } };
        const steps = [
            event("r1", "container.stopped", web),
            event("r2", "container.died", { ...web, data: { exitCode: 0 } }),
            event("r3", "container.started", web),
            event("r4", "container.died", exit1),
            event("a1", "container.started", web),
            event("a2", "container.died", exit1),
            event("b1", "container.started", web),
        ];
        const groups = groupActivity(newestFirst(...steps));
        expect(groups.map((g) => [g.head, ...g.members].map((e) => e.id))).toEqual([
            ["b1"],
            ["a1", "a2"],
            ["r1", "r2", "r3", "r4"],
        ]);
        expect(groups.map((g) => g.title)).toEqual([
            undefined,
            "Container web exited with code 1",
            "Container web restarted, then exited with code 1",
        ]);
    });

    it("keeps the runs of a loop together, whatever else happened in between", () => {
        const steps = [
            event("a1", "container.started", web),
            event("a2", "container.died", web),
            event("x", "container.stopped", { subject: { containerName: "db" } }),
            event("b1", "container.started", web),
            event("b2", "container.died", web),
        ];
        expect(groupActivity(newestFirst(...steps)).map((g) => g.head.id)).toEqual(["b1", "a1", "x"]);
    });

    it("does not fold across hosts", () => {
        const here = event("a", "container.stopped", web);
        const there = event("b", "container.started", { ...web, clientId: "h2" });
        expect(groupActivity(newestFirst(here, there)).map((g) => g.title)).toEqual([undefined, undefined]);
    });

    it("leaves a single lifecycle event the row it was", () => {
        const started = event("s", "container.started", web);
        expect(groupActivity([started])).toEqual([
            { head: started, members: [], level: "info", unseen: false, superseded: [] },
        ]);
    });

    it("does not take a correlated event into a burst", () => {
        const stopped = event("a", "container.stopped", web);
        const started = event("b", "container.started", { ...web, correlationId: "run" });
        const groups = groupActivity(newestFirst(stopped, started));
        expect(groups).toHaveLength(2);
        expect(groups.every((g) => g.title === undefined)).toBe(true);
    });

    it("takes the signal in front of an exit in as a step, and names the row the same", () => {
        const signal = event("k", "container.killed", { ...web, level: "trace", data: { signal: 15 } });
        const steps = [signal, ...recreate()];
        const [group, ...rest] = groupActivity(newestFirst(...steps));
        expect(rest).toEqual([]);
        expect(group.title).toBe("Container web recreated");
        expect([group.head, ...group.members]).toEqual(steps);
    });

    it("does not fold what is not a lifecycle event", () => {
        const started = event("a", "container.started", web);
        const healthy = event("b", "container.health", web);
        expect(groupActivity(newestFirst(started, healthy))).toHaveLength(2);
    });
});

describe("lifecycleTitle", () => {
    const step = (kind: string) => event(kind, kind, { subject: { containerName: "web" } });
    const recreateKinds = ["container.stopped", "container.died", "container.removed", "container.created", "container.started"];

    it.each([
        [["container.stopped", "container.died", "container.removed", "container.created", "container.started"], "Container web recreated"],
        [["container.created", "container.started"], "Container web created and started"],
        [["container.created", "container.started", "container.died", "container.removed"], "Container web created and removed again"],
        [["container.stopped", "container.died", "container.removed"], "Container web removed"],
        [["container.died", "container.started"], "Container web restarted"],
        [["container.stopped", "container.died"], "Container web exited"],
        [["container.started", "container.died"], "Container web exited"],
        [["container.started", "container.stopped"], "Container web stopped"],
        [["container.died", "container.started", "container.died"], "Container web restarted, then exited"],
        [["container.created", "container.started", "container.died", "container.removed"], "Container web created and removed again"],
    ])("reads %j as %s", (kinds, title) => {
        expect(lifecycleTitle(kinds.map(step))).toBe(title);
    });

    it("names a run that ended within the burst by how it ended", () => {
        const died = event("d", "container.died", { subject: { containerName: "web" }, data: { exitCode: 1 } });
        expect(lifecycleTitle([step("container.started"), died])).toBe("Container web exited with code 1");
        expect(
            lifecycleTitle([step("container.stopped"), step("container.died"), step("container.started"), died]),
        ).toBe("Container web restarted, then exited with code 1");
        expect(lifecycleTitle([step("container.created"), step("container.started"), died])).toBe(
            "Container web created and started, then exited with code 1",
        );
        expect(lifecycleTitle([...recreateKinds.map(step), died])).toBe("Container web recreated, then exited with code 1");
    });
});

describe("splitRuns", () => {
    const kindsOf = (...kinds: string[]) =>
        splitRuns(kinds.map((kind) => event(kind, `container.${kind}`))).map((run) =>
            run.map((step) => step.kind.slice("container.".length)),
        );

    it("ends a run where the next start begins", () => {
        expect(kindsOf("started", "died", "started", "died", "started")).toEqual([
            ["started", "died"],
            ["started", "died"],
            ["started"],
        ]);
    });

    it("keeps what leads up to the first start with it", () => {
        expect(kindsOf("stopped", "died", "started", "died", "started", "died")).toEqual([
            ["stopped", "died", "started", "died"],
            ["started", "died"],
        ]);
    });

    it.each([
        ["a recreate", ["stopped", "died", "removed", "created", "started"]],
        ["a restart", ["stopped", "died", "started"]],
        ["a helper container", ["created", "started", "died", "removed"]],
        ["a container that only went", ["stopped", "died", "removed"]],
    ])("leaves %s whole", (_, kinds) => {
        expect(kindsOf(...kinds)).toEqual([kinds]);
    });
});
