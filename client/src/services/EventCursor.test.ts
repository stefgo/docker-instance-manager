import { describe, expect, it } from "vitest";
import { EventCursor, EventLineBuffer } from "./EventCursor.js";

const event = (time: number, nano: number, action = "start", id = "abc123") => ({
    Type: "container",
    Action: action,
    time,
    timeNano: time * 1_000_000_000 + nano,
    Actor: { ID: id },
});

describe("the lines of the event stream", () => {
    it("are the events of a chunk that carries several", () => {
        const buffer = new EventLineBuffer();

        expect(buffer.push('{"a":1}\n{"a":2}\n')).toEqual(['{"a":1}', '{"a":2}']);
    });

    it("wait for the chunk that completes them", () => {
        const buffer = new EventLineBuffer();

        expect(buffer.push('{"a":')).toEqual([]);
        expect(buffer.push('1}\n{"a"')).toEqual(['{"a":1}']);
        expect(buffer.push(":2}\n")).toEqual(['{"a":2}']);
    });

    it("leave out the empty ones", () => {
        const buffer = new EventLineBuffer();

        expect(buffer.push('\r\n{"a":1}\r\n\n')).toEqual(['{"a":1}']);
    });
});

describe("the position in the event stream", () => {
    it("is unknown before anything set it", () => {
        expect(new EventCursor().since()).toBeUndefined();
    });

    it("starts at the host's clock and is not moved back by a second start", () => {
        const cursor = new EventCursor();

        cursor.begin(1_760_000_000_500);
        cursor.begin(1_750_000_000_000);

        expect(cursor.since()).toBe(1_760_000_000);
    });

    it("is the second of the latest event", () => {
        const cursor = new EventCursor();

        cursor.advance(event(100, 1));
        cursor.advance(event(102, 1));

        expect(cursor.since()).toBe(102);
    });

    it("is read from timeNano where an event has no time", () => {
        const cursor = new EventCursor();

        cursor.advance({ Type: "container", Action: "start", timeNano: 102_500_000_000 });

        expect(cursor.since()).toBe(102);
    });
});

describe("an event that is replayed", () => {
    it("is passed over when it has been through before", () => {
        const cursor = new EventCursor();
        cursor.advance(event(100, 1, "die"));
        cursor.advance(event(100, 2, "start"));

        expect(cursor.advance(event(100, 1, "die"))).toBe(false);
        expect(cursor.advance(event(100, 2, "start"))).toBe(false);
    });

    it("is taken when it is new within the same second", () => {
        const cursor = new EventCursor();
        cursor.advance(event(100, 1, "die"));

        expect(cursor.advance(event(100, 900_000_000, "start"))).toBe(true);
    });

    it("is told apart from another object's event at the same instant", () => {
        const cursor = new EventCursor();
        cursor.advance(event(100, 1, "start", "abc123"));

        expect(cursor.advance(event(100, 1, "start", "def456"))).toBe(true);
    });

    it("is taken when it lies after the position", () => {
        const cursor = new EventCursor();
        cursor.advance(event(100, 1));

        expect(cursor.advance(event(101, 1))).toBe(true);
        expect(cursor.advance(event(101, 1))).toBe(false);
    });
});

describe("an event the position cannot place", () => {
    it("is taken when it was overtaken by a later one, and leaves the position alone", () => {
        const cursor = new EventCursor();
        cursor.advance(event(101, 1));

        expect(cursor.advance(event(100, 999_999_999))).toBe(true);
        expect(cursor.since()).toBe(101);
    });

    it("is taken when it carries no clock", () => {
        const cursor = new EventCursor();
        cursor.advance(event(100, 1));

        expect(cursor.advance({ Type: "container", Action: "start" })).toBe(true);
        expect(cursor.advance({ Type: "container", Action: "start" })).toBe(true);
    });
});
