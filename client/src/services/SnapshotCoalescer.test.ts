import { describe, expect, it } from "vitest";
import { SnapshotCoalescer } from "./SnapshotCoalescer.js";

/** A read that stays open until the test settles it, so a burst can arrive meanwhile. */
function harness() {
    const open: Array<{ resolve: (value: number) => void; reject: (err: unknown) => void }> = [];
    const delivered: number[] = [];
    const errors: unknown[] = [];
    const coalescer = new SnapshotCoalescer<number>(
        () => new Promise((resolve, reject) => open.push({ resolve, reject })),
        (snapshot) => delivered.push(snapshot),
        (err) => errors.push(err),
    );
    /** Lets the microtasks between a settled read and the next one run. */
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    return { coalescer, open, delivered, errors, settle };
}

describe("a request for a snapshot", () => {
    it("is read at once while nothing is being read", async () => {
        const { coalescer, open, delivered, settle } = harness();

        coalescer.request();
        expect(open).toHaveLength(1);
        open[0].resolve(1);
        await settle();

        expect(delivered).toEqual([1]);
        expect(open).toHaveLength(1);
    });

    it("waits for the read under way instead of starting a second one", async () => {
        const { coalescer, open } = harness();

        coalescer.request();
        coalescer.request();

        expect(open).toHaveLength(1);
    });

    it("folds a burst into one further read", async () => {
        const { coalescer, open, delivered, settle } = harness();

        coalescer.request();
        for (let i = 0; i < 30; i++) coalescer.request();
        open[0].resolve(1);
        await settle();
        expect(open).toHaveLength(2);
        open[1].resolve(2);
        await settle();

        expect(delivered).toEqual([1, 2]);
        expect(open).toHaveLength(2);
    });

    it("is read again after the burst has been answered", async () => {
        const { coalescer, open, delivered, settle } = harness();

        coalescer.request();
        open[0].resolve(1);
        await settle();
        coalescer.request();
        open[1].resolve(2);
        await settle();

        expect(delivered).toEqual([1, 2]);
    });

    it("survives a read that fails", async () => {
        const { coalescer, open, delivered, errors, settle } = harness();

        coalescer.request();
        coalescer.request();
        open[0].reject(new Error("daemon gone"));
        await settle();
        open[1].resolve(2);
        await settle();

        expect(errors).toHaveLength(1);
        expect(delivered).toEqual([2]);
    });
});
