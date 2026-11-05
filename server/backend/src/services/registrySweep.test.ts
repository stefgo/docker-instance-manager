import { describe, expect, it, vi } from "vitest";
import type { ImageUpdateCheckResult } from "@dim/shared";
import { sweepTargets, type SweepHandlers } from "./registrySweep.js";

const answer = (repoTag: string, over: Partial<ImageUpdateCheckResult> = {}): ImageUpdateCheckResult => ({
    repoTag,
    localDigest: "sha256:old",
    remoteDigest: "sha256:old",
    hasUpdate: false,
    ...over,
});

const limited = (repoTag: string): ImageUpdateCheckResult =>
    answer(repoTag, { remoteDigest: null, error: "Registry rate limit reached (429)", rateLimited: true, retryAfterSeconds: 600 });

/** Checks that settle when the test says so, so the order of events is the test's. */
function controlledChecks() {
    const pending = new Map<string, (result: ImageUpdateCheckResult) => void>();
    let running = 0;
    let peak = 0;
    const check = vi.fn((target: string) => {
        running++;
        peak = Math.max(peak, running);
        return new Promise<ImageUpdateCheckResult>((resolve) => {
            pending.set(target, (result) => {
                running--;
                resolve(result);
            });
        });
    });
    return {
        check,
        peak: () => peak,
        started: () => check.mock.calls.map(([t]) => t),
        settle: async (target: string, result: ImageUpdateCheckResult = answer(target)) => {
            pending.get(target)!(result);
            pending.delete(target);
            // Let the worker pick up its next target.
            await new Promise((r) => setTimeout(r, 0));
        },
    };
}

function handlers(check: SweepHandlers<string>["check"], concurrency = 2) {
    return {
        concurrency,
        check,
        onAnswer: vi.fn(),
        onSkipped: vi.fn(),
        onError: vi.fn(),
    } satisfies SweepHandlers<string>;
}

describe("sweepTargets", () => {
    it("asks about every target once", async () => {
        const h = handlers(async (t) => answer(t), 3);

        const outcome = await sweepTargets(["a", "b", "c", "d", "e"], h);

        expect(h.onAnswer.mock.calls.map(([t]) => t).sort()).toEqual(["a", "b", "c", "d", "e"]);
        expect(outcome).toMatchObject({ checked: 5, failed: 0, rateLimit: null, skippedFrom: null });
        expect(h.onSkipped).not.toHaveBeenCalled();
    });

    it("never has more checks under way than allowed, and starts them in list order", async () => {
        const c = controlledChecks();
        const sweep = sweepTargets(["a", "b", "c", "d"], handlers(c.check, 2));

        expect(c.started()).toEqual(["a", "b"]);
        await c.settle("b");
        expect(c.started()).toEqual(["a", "b", "c"]);
        await c.settle("a");
        await c.settle("c");
        await c.settle("d");
        await sweep;

        expect(c.started()).toEqual(["a", "b", "c", "d"]);
        expect(c.peak()).toBe(2);
    });

    it("starts nothing once the registry refused, and lets the checks under way finish", async () => {
        const c = controlledChecks();
        const h = handlers(c.check, 2);
        const sweep = sweepTargets(["a", "b", "c", "d", "e"], h);

        await c.settle("a", limited("a"));
        // `b` was under way already; `c` to `e` are not asked.
        await c.settle("b");
        const outcome = await sweep;

        expect(c.started()).toEqual(["a", "b"]);
        expect(h.onAnswer.mock.calls.map(([t]) => t)).toEqual(["b"]);
        expect(h.onSkipped.mock.calls.map(([t]) => t).sort()).toEqual(["a", "c", "d", "e"]);
        expect(outcome.rateLimit).toEqual({ error: "Registry rate limit reached (429)", retryAfterSeconds: 600 });
        expect(outcome.checked).toBe(1);
    });

    it("does not store the refused answer as one", async () => {
        const h = handlers(async (t) => (t === "b" ? limited(t) : answer(t)), 1);

        await sweepTargets(["a", "b", "c"], h);

        expect(h.onAnswer.mock.calls.map(([t]) => t)).toEqual(["a"]);
        expect(h.onSkipped).toHaveBeenCalledWith("b", "Registry rate limit reached (429)");
        expect(h.onSkipped).toHaveBeenCalledWith("c", "Registry rate limit reached (429)");
    });

    it("resumes from the first target in list order that got no answer", async () => {
        const c = controlledChecks();
        const sweep = sweepTargets(["a", "b", "c", "d"], handlers(c.check, 2));

        // `b` is refused while `a` is still out; `a` gets its answer afterwards.
        await c.settle("b", limited("b"));
        await c.settle("a");

        expect((await sweep).skippedFrom).toBe("b");
    });

    it("counts answers with an error, and keeps the last one", async () => {
        const h = handlers(async (t) => (t === "b" ? answer(t, { error: "Tag not found in registry (404)" }) : answer(t)), 1);

        const outcome = await sweepTargets(["a", "b", "c"], h);

        expect(outcome).toMatchObject({ checked: 3, failed: 1, lastError: "Tag not found in registry (404)" });
    });

    it("leaves a check that threw out of both answers and skips", async () => {
        const h = handlers(async (t) => {
            if (t === "b") throw new Error("boom");
            return answer(t);
        }, 1);

        const outcome = await sweepTargets(["a", "b", "c"], h);

        expect(h.onError).toHaveBeenCalledWith("b", expect.any(Error));
        expect(outcome).toMatchObject({ checked: 2, skippedFrom: null });
    });

    it("passes on the remaining count the registry reported", async () => {
        const h = handlers(async (t) => answer(t, { rateLimitRemaining: t === "a" ? 90 : 89 }), 1);

        expect((await sweepTargets(["a", "b"], h)).remaining).toBe(89);
    });

    it("does nothing for an empty group", async () => {
        const h = handlers(async (t) => answer(t));

        expect(await sweepTargets([], h)).toMatchObject({ checked: 0, skippedFrom: null, rateLimit: null });
    });
});
