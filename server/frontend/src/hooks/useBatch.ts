import { useCallback } from "react";
import { useToast } from "@stefgo/react-ui-components";
import { SessionExpiredError } from "../lib/apiFetch";
import { outcomeToast, runningToast, type BatchSpec, type BatchState } from "../lib/batchToast";
import { getErrorMessage } from "../utils";

/** One request of a bulk action, already sent, and what it was for. */
export interface BatchStep {
    /** Named in front of the reason it was refused for; left out where the reason names it. */
    label?: string;
    result: Promise<unknown>;
}

/**
 * How long the bar is on screen at least. Requests answered from a cache are through in a
 * few milliseconds, and a bar that turns into the outcome before it was drawn says nothing
 * about the action having run.
 */
const MIN_RUNNING_MS = 1000;

/**
 * Reports a bulk action -- a header's check, a pull or a start of the picked rows -- through
 * one toast instead of one per refusal: a bar while its requests are out, then the outcome.
 *
 * The requests are sent by the caller and only watched here; their spinners in the rows
 * stay what they were. The toast outlives the page that started the action, as the
 * provider sits above the router.
 *
 * Dismissed while the requests are out, the toast is not raised again for the next step --
 * but the outcome is, as a new toast: it may name a refusal, and nothing else does.
 *
 * Resolves once every request is through; the outcome may follow up to `MIN_RUNNING_MS`
 * later, which a caller that reloads a list afterwards does not wait for.
 */
export function useBatch() {
    const { show, update, dismiss } = useToast();

    return useCallback(
        async (spec: BatchSpec, steps: readonly BatchStep[]): Promise<void> => {
            if (steps.length === 0) return;
            const state: BatchState = { total: steps.length, done: 0, failures: [] };
            const id = show(runningToast(spec, state));
            const shownAt = Date.now();
            let shown = true;
            let expired = false;

            await Promise.all(
                steps.map(({ label, result }) =>
                    result
                        .catch((e: unknown) => {
                            // The login form is on screen and says it already.
                            if (e instanceof SessionExpiredError) expired = true;
                            else state.failures.push({ label, message: getErrorMessage(e) });
                        })
                        .finally(() => {
                            state.done++;
                            if (shown) shown = update(id, runningToast(spec, state));
                        }),
                ),
            );

            if (expired) {
                dismiss(id);
                return;
            }
            const outcome = outcomeToast(spec, state);
            setTimeout(() => {
                if (!update(id, outcome)) show(outcome);
            }, Math.max(0, MIN_RUNNING_MS - (Date.now() - shownAt)));
        },
        [show, update, dismiss],
    );
}
