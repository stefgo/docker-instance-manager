import { RATE_LIMIT_FALLBACK_SECONDS, type ImageUpdateCheckResult } from "@dim/shared";

/**
 * How many checks of one registry are under way at once. Registries are swept side by side
 * on top of this, since each counts its own limit. Four keeps a sweep short without
 * looking like a burst to a registry; a rate limit stops all four the same way it stopped
 * one.
 */
export const REGISTRY_SWEEP_CONCURRENCY = 4;

export interface SweepRateLimit {
    error: string;
    retryAfterSeconds: number;
}

export interface SweepOutcome<T> {
    /** Targets the registry answered, with or without an error. */
    checked: number;
    /** Of those, the ones whose answer carries an error. */
    failed: number;
    lastError: string | null;
    /** Set once the registry turned a request away over its rate limit. */
    rateLimit: SweepRateLimit | null;
    /**
     * The first target in list order that got no answer -- the one the rate limit refused
     * or one that was never asked. The next sweep starts there.
     */
    skippedFrom: T | null;
    /** The last `ratelimit-remaining` an answer carried. */
    remaining: number | undefined;
}

export interface SweepHandlers<T> {
    concurrency: number;
    check: (target: T) => Promise<ImageUpdateCheckResult>;
    /** An answer to store. */
    onAnswer: (target: T, result: ImageUpdateCheckResult) => void;
    /** A target the rate limit left without an answer; what it knew is to be kept. */
    onSkipped: (target: T, error: string) => void;
    /** A check that threw, which leaves the target as it was. */
    onError: (target: T, err: unknown) => void;
}

/**
 * Asks about one registry's targets, `concurrency` at a time, in list order.
 *
 * Once a check comes back rate limited no further one is started: the rest are handed to
 * `onSkipped`, and so is the refused one -- its answer is no answer, and storing it as
 * one would turn a known update into none. The checks already under way are let finish.
 *
 * Kept apart from the scheduler, which reads the database and the config the moment it is
 * imported, so the order and the stop can be tested on their own.
 */
export async function sweepTargets<T>(targets: readonly T[], handlers: SweepHandlers<T>): Promise<SweepOutcome<T>> {
    const { concurrency, check, onAnswer, onSkipped, onError } = handlers;
    let checked = 0;
    let failed = 0;
    let lastError: string | null = null;
    let rateLimit: SweepRateLimit | null = null;
    let remaining: number | undefined;
    let firstSkipped = Infinity;

    const skip = (index: number, error: string) => {
        firstSkipped = Math.min(firstSkipped, index);
        onSkipped(targets[index], error);
    };

    let next = 0;
    const worker = async () => {
        while (next < targets.length) {
            const index = next++;
            const target = targets[index];
            if (rateLimit) {
                skip(index, rateLimit.error);
                continue;
            }
            let result: ImageUpdateCheckResult;
            try {
                result = await check(target);
            } catch (err) {
                onError(target, err);
                continue;
            }
            if (result.rateLimitRemaining !== undefined) remaining = result.rateLimitRemaining;
            if (result.rateLimited) {
                rateLimit ??= {
                    error: result.error ?? "Registry rate limit reached (429)",
                    retryAfterSeconds: result.retryAfterSeconds ?? RATE_LIMIT_FALLBACK_SECONDS,
                };
                skip(index, result.error ?? rateLimit.error);
                continue;
            }
            onAnswer(target, result);
            checked++;
            if (result.error) {
                failed++;
                lastError = result.error;
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), targets.length) }, worker));

    return {
        checked,
        failed,
        lastError,
        rateLimit,
        skippedFrom: Number.isFinite(firstSkipped) ? targets[firstSkipped] : null,
        remaining,
    };
}
