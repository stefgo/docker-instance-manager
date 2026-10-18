import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { LISTED_REPEATS, collapseRepeats, describeRepeats, rowEvents } from "./collapseRepeats";
import { type ActivityGroup, groupActivity } from "./groupActivity";
import { formatDate, formatTime } from "../../../utils";

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

    it("folds a crash loop into one row however fast it restarts, below the restart that began it", () => {
        const web = { subject: { containerName: "web" } };
        const at = (second: number) => ({ occurredAt: new Date(Date.UTC(2026, 0, 2, 0, 0, second)).toISOString() });
        const exit1 = { ...web, level: "warning" as const, data: { exitCode: 1 } };
        const rows = rowsOf(
            event("r1", "container.stopped", { ...web, ...at(0) }),
            event("r2", "container.died", { ...web, data: { exitCode: 0 }, ...at(0) }),
            event("r3", "container.started", { ...web, ...at(0) }),
            event("r4", "container.died", { ...exit1, ...at(1) }),
            // Docker's back-off: a second or two at first, then further apart than a burst reaches.
            ...[2, 3, 4, 6, 9, 13, 20, 34, 60].flatMap((second, i) => [
                event(`s${i}`, "container.started", { ...web, ...at(second) }),
                event(`d${i}`, "container.died", { ...exit1, ...at(second + 1) }),
            ]),
        );
        expect(rows.map((r) => r.title)).toEqual([
            "Container web exited with code 1",
            "Container web restarted, then exited with code 1",
        ]);
        expect(rows[0].repeats).toHaveLength(8);
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

describe("describeRepeats", () => {
    const locale = "en-GB";
    // Midday UTC, so a span of a few hours stays on one day in any time zone the tests run in.
    const noon = Date.UTC(2026, 9, 14, 12, 0, 0);
    /** `count` repeats `gapMs` apart, the newest `gapMs` before noon, newest first. */
    const repeats = (count: number, gapMs: number) =>
        Array.from({ length: count }, (_, i) => {
            const at = new Date(noon - (i + 1) * gapMs);
            return groupActivity([died(`r${i}`, { occurredAt: at.toISOString() })])[0];
        });
    const date = (at: Date) => formatDate(at, { seconds: true, locale });
    const at = (group: ActivityGroup) => new Date(group.head.occurredAt);

    it("names a few repeats one by one, each with its date", () => {
        const few = repeats(LISTED_REPEATS, 61_000);
        expect(describeRepeats(few, locale)).toBe(`Also ${few.map((g) => date(at(g))).join(" · ")}`);
    });

    it("sums up a restart loop: the latest few, how many more, since when, how often", () => {
        const loop = repeats(421, 61_000);
        const latest = loop.slice(0, 3).map((g) => formatTime(at(g), locale));
        expect(describeRepeats(loop, locale)).toBe(
            `Also ${latest.join(" · ")} and 418 more back to ${date(at(loop[420]))}, about every 61 s`,
        );
    });

    it("keeps the dates of the latest when the repeats span several days", () => {
        const everyOtherDay = repeats(LISTED_REPEATS + 1, 48 * 3600_000);
        const text = describeRepeats(everyOtherDay, locale);
        expect(text).toContain(`Also ${date(at(everyOtherDay[0]))} · `);
        expect(text).toMatch(/about every 2 d$/);
    });

    it("orders by time, whatever order the list is sorted in", () => {
        const loop = repeats(LISTED_REPEATS + 1, 120_000);
        expect(describeRepeats([...loop].reverse(), locale)).toBe(describeRepeats(loop, locale));
        expect(describeRepeats(loop, locale)).toMatch(/about every 2 min$/);
    });
});
