import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, unknown>();

// The data directory is a map here: nothing is read from disk and nothing written.
vi.mock("./DataStore.js", () => ({
    readJsonFile: (name: string) => files.get(name) ?? null,
    writeJsonFile: (name: string, value: unknown) => {
        files.set(name, JSON.parse(JSON.stringify(value)));
        return true;
    },
}));

const { AckQueue } = await import("./AckQueue.js");

interface Entry {
    id: string;
    at: string;
}

const DAY = 24 * 60 * 60 * 1000;

function queue(maxItems = 3) {
    return new AckQueue<Entry>({
        file: "test-queue.json",
        label: "test entries",
        parse: (value) => {
            const entry = value as Partial<Entry> | null;
            return typeof entry?.id === "string" && typeof entry.at === "string" ? { id: entry.id, at: entry.at } : null;
        },
        timeOf: (entry) => entry.at,
        maxItems,
        maxAgeMs: 7 * DAY,
    });
}

const now = () => new Date().toISOString();

beforeEach(() => {
    files.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("sending", () => {
    it("offers every unacknowledged entry and drops what is acknowledged", () => {
        const q = queue();
        const batches: string[][] = [];
        q.setTransport((entries) => {
            batches.push(entries.map((e) => e.id));
            return true;
        });
        q.push({ id: "a", at: now() });
        q.push({ id: "b", at: now() });
        expect(batches).toEqual([["a"], ["a", "b"]]);

        q.acknowledge(["a"]);
        expect(q.size).toBe(1);
        q.flush();
        expect(batches.at(-1)).toEqual(["b"]);
    });

    it("keeps everything while there is no transport, and sends it once there is", () => {
        const q = queue();
        q.push({ id: "a", at: now() });
        const sent: string[] = [];
        q.setTransport((entries) => {
            sent.push(...entries.map((e) => e.id));
            return true;
        });
        q.flush();
        expect(sent).toEqual(["a"]);
    });

    it("offers an unacknowledged batch again after a minute", () => {
        const q = queue();
        let offers = 0;
        q.setTransport(() => {
            offers++;
            return true;
        });
        q.push({ id: "a", at: now() });
        expect(offers).toBe(1);
        vi.advanceTimersByTime(60_000);
        expect(offers).toBe(2);
    });

    it("drops the oldest once it is full", () => {
        const q = queue(2);
        for (const id of ["a", "b", "c"]) q.push({ id, at: now() });
        const sent: string[][] = [];
        q.setTransport((entries) => {
            sent.push(entries.map((e) => e.id));
            return true;
        });
        q.flush();
        expect(sent).toEqual([["b", "c"]]);
    });

    it("never sends what has grown older than the queue keeps", () => {
        const q = queue();
        q.push({ id: "old", at: now() });
        vi.setSystemTime(Date.now() + 8 * DAY);
        q.push({ id: "new", at: now() });
        const sent: string[] = [];
        q.setTransport((entries) => {
            sent.push(...entries.map((e) => e.id));
            return true;
        });
        q.flush();
        expect(sent).toEqual(["new"]);
    });
});

describe("the file on disk", () => {
    it("restores what the last process had not had acknowledged, without what it cannot read", () => {
        files.set("test-queue.json", [
            { id: "a", at: now() },
            { nonsense: true },
            { id: "old", at: new Date(Date.now() - 8 * DAY).toISOString() },
        ]);
        expect(queue().size).toBe(1);
    });

    it("is written once for a burst, and at once on shutdown", () => {
        const q = queue();
        q.push({ id: "a", at: now() });
        q.push({ id: "b", at: now() });
        expect(files.has("test-queue.json")).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(files.get("test-queue.json")).toHaveLength(2);

        q.push({ id: "c", at: now() });
        q.persistNow();
        expect(files.get("test-queue.json")).toHaveLength(3);
    });
});
