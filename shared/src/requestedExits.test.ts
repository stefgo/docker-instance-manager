import { describe, expect, it } from "vitest";
import { markRequestedExits } from "./requestedExits.js";
import type { ActivityEvent } from "./types.js";

let clock = 0;

const web = { containerName: "web", containerId: "c1" };

const event = (id: string, kind: string, over: Partial<ActivityEvent> = {}): ActivityEvent => {
    clock += 1;
    return {
        id,
        kind,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
        source: "agent",
        level: "info",
        subject: web,
        ...over,
    };
};

const killed = (id: string, over: Partial<ActivityEvent> = {}) =>
    event(id, "container.killed", { level: "trace", data: { signal: 15 }, ...over });
const died = (id: string, over: Partial<ActivityEvent> = {}) =>
    event(id, "container.died", { level: "warning", data: { exitCode: 143 }, ...over });

const never = () => false;

/** The ids of the exits marked as asked for. */
const requestedIds = (events: ActivityEvent[], signalledBefore: (e: ActivityEvent) => boolean = never) =>
    markRequestedExits(events, signalledBefore)
        .filter((e) => e.data?.requested === true)
        .map((e) => e.id);

describe("markRequestedExits", () => {
    it("stores an exit that followed a signal as info, and says it was asked for", () => {
        const [, exit] = markRequestedExits([killed("k"), died("d")], never);
        expect(exit.level).toBe("info");
        expect(exit.data).toEqual({ exitCode: 143, requested: true });
    });

    it("does not raise an exit below info, and leaves the rest of the batch as it was", () => {
        const batch = [killed("k"), died("d", { level: "trace" }), event("x", "container.removed")];
        const marked = markRequestedExits(batch, never);
        expect(marked[1].level).toBe("trace");
        expect(marked[0]).toBe(batch[0]);
        expect(marked[2]).toBe(batch[2]);
    });

    it("leaves a container that ended by itself alone", () => {
        const batch = [died("d"), event("r", "container.removed")];
        expect(markRequestedExits(batch, never)).toBe(batch);
    });

    it("answers a signal with one exit only, and not across a start", () => {
        const batch = [killed("k"), died("d1"), event("s", "container.started"), died("d2")];
        expect(requestedIds(batch)).toEqual(["d1"]);
    });

    it("lets a signal go unanswered once the window has passed", () => {
        const signal = killed("k");
        clock += 61;
        expect(requestedIds([signal, died("d")])).toEqual([]);
    });

    it("keeps to its own container, by id and else by name", () => {
        const db = { containerName: "db", containerId: "c2" };
        expect(requestedIds([killed("k"), died("d", { subject: db })])).toEqual([]);
        const byName = { containerName: "web" };
        expect(requestedIds([killed("k", { subject: byName }), died("d", { subject: byName })])).toEqual(["d"]);
    });

    it("reads the batch by its clocks, and by its order where they are the same", () => {
        const signal = killed("k");
        const exit = died("d");
        expect(requestedIds([exit, signal])).toEqual(["d"]);
        const sameTime = died("d2", { occurredAt: signal.occurredAt });
        expect(requestedIds([signal, sameTime])).toEqual(["d2"]);
    });

    it("asks what was stored before only for a container the batch has no earlier step of", () => {
        const asked: string[] = [];
        const before = (e: ActivityEvent) => {
            asked.push(e.id);
            return true;
        };
        expect(requestedIds([died("d1"), event("s", "container.started"), died("d2")], before)).toEqual(["d1"]);
        expect(asked).toEqual(["d1"]);
    });
});
