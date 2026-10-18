import { describe, expect, it } from "vitest";
import { StateChannel, StateReporter, listenerChannel } from "./StateReporter.js";

/** A source the test changes by hand, with the listeners a `listenerChannel` registers. */
function source(initial: { lastRun: string | null; nextRun: string | null }) {
    let value = initial;
    const listeners: Array<() => void> = [];
    return {
        current: () => value,
        onChange: (listener: () => void) => listeners.push(listener),
        set(next: typeof value) {
            value = next;
            for (const listener of listeners) listener();
        },
    };
}

/** A transport that records what it sent and can be switched off. */
function transport() {
    const sent: Array<{ type: string; payload: unknown }> = [];
    let open = true;
    return {
        sent,
        close: () => (open = false),
        open: () => (open = true),
        send: (type: string, payload: unknown) => {
            if (!open) return false;
            sent.push({ type, payload });
            return true;
        },
    };
}

const A = { lastRun: "2026-10-17T03:00:00.000Z", nextRun: "2026-10-18T03:00:00.000Z" };
const B = { lastRun: "2026-10-18T03:00:00.000Z", nextRun: "2026-10-19T03:00:00.000Z" };

describe("StateReporter", () => {
    it("sends every channel's current value on connect", () => {
        const src = source(A);
        const wire = transport();
        const reporter = new StateReporter(
            [listenerChannel("AUTO_UPDATE_STATE", src.current, src.onChange)],
            wire.send,
        );

        reporter.connected();

        expect(wire.sent).toEqual([{ type: "AUTO_UPDATE_STATE", payload: A }]);
    });

    it("sends a change, and holds back a value equal to the last one sent", () => {
        const src = source(A);
        const wire = transport();
        const reporter = new StateReporter(
            [listenerChannel("AUTO_UPDATE_STATE", src.current, src.onChange)],
            wire.send,
        );
        reporter.connected();

        src.set({ ...A });
        src.set(B);

        expect(wire.sent.map((m) => m.payload)).toEqual([A, B]);
    });

    it("sends the current value again on every new connection, even if unchanged", () => {
        const src = source(A);
        const wire = transport();
        const reporter = new StateReporter(
            [listenerChannel("AUTO_UPDATE_STATE", src.current, src.onChange)],
            wire.send,
        );
        reporter.connected();
        reporter.connected();

        expect(wire.sent.map((m) => m.payload)).toEqual([A, A]);
    });

    it("does not count a value that could not go out as sent", () => {
        const src = source(A);
        const wire = transport();
        const reporter = new StateReporter(
            [listenerChannel("AUTO_UPDATE_STATE", src.current, src.onChange)],
            wire.send,
        );
        reporter.connected();
        wire.close();
        src.set(B);
        wire.open();
        src.set({ ...B });

        expect(wire.sent.map((m) => m.payload)).toEqual([A, B]);
    });

    it("subscribes each channel once, however often it connects", () => {
        let subscriptions = 0;
        const channel: StateChannel = {
            type: "DOCKER_UPDATE",
            dedupe: false,
            subscribe: () => {
                subscriptions++;
            },
            refresh: () => {},
        };
        const reporter = new StateReporter([channel], transport().send);

        reporter.connected();
        reporter.connected();

        expect(subscriptions).toBe(1);
    });

    it("sends every value of a channel without dedupe", () => {
        let emit: (payload: unknown) => void = () => {};
        const state = { containers: [], images: [], volumes: [], networks: [] };
        const channel: StateChannel = {
            type: "DOCKER_UPDATE",
            dedupe: false,
            subscribe: (next) => {
                emit = next as (payload: unknown) => void;
            },
            refresh: () => emit(state),
        };
        const wire = transport();
        const reporter = new StateReporter([channel], wire.send);

        reporter.connected();
        emit(state);

        expect(wire.sent).toHaveLength(2);
    });
});
