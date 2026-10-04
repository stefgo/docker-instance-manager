import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { collapseRepeats, rowEvents } from "./collapseRepeats";
import { groupActivity } from "./groupActivity";

let clock = 0;

/** Events are created oldest first and a minute apart, so nothing here is a lifecycle burst. */
const event = (id: string, kind: string, over: Partial<ActivityRecord> = {}): ActivityRecord => {
    clock += 1;
    const at = new Date(Date.UTC(2026, 0, 1, 0, clock, 0)).toISOString();
    return {
        id,
        kind,
        occurredAt: at,
        receivedAt: at,
        source: "agent",
        clientId: "h1",
        level: "info",
        seen: false,
        ...over,
    };
};

const died = (id: string, over: Partial<ActivityRecord> = {}) =>
    event(id, "container.died", { level: "warning", subject: { containerName: "web" }, data: { exitCode: 137 }, ...over });

const rowsOf = (...events: ActivityRecord[]) => collapseRepeats(groupActivity([...events].reverse()));

describe("collapseRepeats", () => {
    it("folds the same message about the same container into the newest row", () => {
        const rows = rowsOf(died("a"), died("b"), died("c"));
        expect(rows).toHaveLength(1);
        expect(rows[0].head.id).toBe("c");
        expect(rows[0].repeats.map((g) => g.head.id)).toEqual(["b", "a"]);
    });

    it("leaves a row without a repeat as it is", () => {
        const [row] = rowsOf(died("a"));
        expect(row.repeats).toEqual([]);
    });

    it("does not fold across a row that says something else", () => {
        const rows = rowsOf(died("a"), event("x", "client.registered"), died("b"));
        expect(rows.map((r) => r.head.id)).toEqual(["b", "x", "a"]);
    });

    it.each([
        ["another container", { subject: { containerName: "db" } }],
        ["another host", { clientId: "h2" }],
        ["another exit code", { data: { exitCode: 1 } }],
        ["another level", { level: "error" as const }],
        ["one that has been seen", { seen: true }],
    ])("keeps %s apart", (_, over) => {
        expect(rowsOf(died("a"), died("b", over))).toHaveLength(2);
    });

    it("folds repeated bursts by what they amounted to", () => {
        const web = { subject: { containerName: "web" } };
        const restart = (p: string) => {
            clock += 1;
            const at = new Date(Date.UTC(2026, 0, 1, 0, clock, 0)).toISOString();
            return [
                event(`${p}1`, "container.died", { ...web, occurredAt: at }),
                event(`${p}2`, "container.started", { ...web, occurredAt: at }),
            ];
        };
        const rows = rowsOf(...restart("a"), ...restart("b"));
        expect(rows).toHaveLength(1);
        expect(rows[0].title).toBe("Container web restarted");
        expect(rows[0].repeats).toHaveLength(1);
    });

    it("never folds a correlated group with steps", () => {
        const action = (id: string) => [
            event(`${id}q`, "action.requested", { source: "server", correlationId: id }),
            event(`${id}d`, "action.completed", { correlationId: id }),
        ];
        expect(rowsOf(...action("a"), ...action("b"))).toHaveLength(2);
    });
});

describe("rowEvents", () => {
    it("names every event of the row and of its repeats", () => {
        const [row] = rowsOf(died("a"), died("b"));
        expect(rowEvents(row).map((e) => e.id)).toEqual(["b", "a"]);
    });
});
