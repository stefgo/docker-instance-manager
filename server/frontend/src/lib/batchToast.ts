import type { ToastOptions } from "@stefgo/react-ui-components";
import { plural } from "../utils";

/** The verb of a bulk action in the three forms its toast speaks it in. */
const VERBS = {
    check: { ing: "Checking", past: "Checked" },
    pull: { ing: "Pulling", past: "Pulled" },
    start: { ing: "Starting", past: "Started" },
    stop: { ing: "Stopping", past: "Stopped" },
    reload: { ing: "Reloading", past: "Reloaded" },
    prune: { ing: "Pruning", past: "Pruned" },
} as const;

export type BatchAction = keyof typeof VERBS;

/** What a bulk action does, and to what: "pull" and "image" read "Pulling 12 images". */
export interface BatchSpec {
    action: BatchAction;
    /** One of what the action sends a request for, in the singular. */
    noun: string;
    /**
     * Names what the action reaches in place of the count, for one request that reaches more
     * than itself: a host's prune is one request, whatever it removes ("the unused images
     * of docker-01").
     */
    subject?: string;
}

/** One request that was refused, by what it was for when that is not in the reason already. */
export interface BatchFailure {
    label?: string;
    message: string;
}

export interface BatchState {
    total: number;
    /** The requests that are through, refused or not. */
    done: number;
    failures: BatchFailure[];
}

/** How many reasons the outcome names, and how many items under each, before it only counts. */
const NAMED = 3;

/** "a, b, c and 2 more" */
function names(labels: string[]): string {
    const rest = labels.length - NAMED;
    const named = labels.slice(0, NAMED).join(", ");
    return rest > 0 ? `${named} and ${rest} more` : named;
}

/**
 * The refusals by reason: twenty images behind one unreachable registry are one reason with
 * twenty names, not twenty lines. A reason without a label names its subject itself.
 */
function describeFailures(failures: BatchFailure[]): string {
    const byReason = new Map<string, Set<string>>();
    for (const { label, message } of failures) {
        const labels = byReason.get(message) ?? new Set<string>();
        if (label) labels.add(label);
        byReason.set(message, labels);
    }
    const reasons = Array.from(byReason, ([message, labels]) =>
        labels.size > 0 ? `${message} — ${names([...labels])}` : message,
    );
    const rest = reasons.length - NAMED;
    const named = reasons.slice(0, NAMED).join("; ");
    return rest > 0 ? `${named}; and ${plural(rest, "other reason")}` : named;
}

/** The toast of a bulk action while its requests are out: a bar, and how many were refused. */
export function runningToast({ action, noun, subject }: BatchSpec, { total, done, failures }: BatchState): ToastOptions {
    return {
        variant: "info",
        title: `${VERBS[action].ing} ${subject ?? plural(total, noun)}`,
        description: failures.length > 0 ? `${failures.length} failed` : undefined,
        progress: { value: done, max: total },
        duration: 0,
    };
}

/**
 * The toast of a bulk action once all of its requests are through.
 *
 * Every key is set, `undefined` where the toast has none, because the result is handed to
 * the toast's `update`, which keeps what a key does not replace: the outcome has to take the
 * bar and the running count with it. Without a duration the provider's default applies, so
 * a success leaves by itself; a toast that names failures stays until it is dismissed, like
 * every other failure report.
 */
export function outcomeToast({ action, noun, subject }: BatchSpec, { total, failures }: BatchState): ToastOptions {
    const items = subject ?? plural(total, noun);
    if (failures.length === 0) {
        return {
            variant: "success",
            title: `${VERBS[action].past} ${items}`,
            description: undefined,
            progress: undefined,
            duration: undefined,
        };
    }
    return {
        variant: failures.length === total ? "error" : "warning",
        title: subject ? `Could not ${action} ${subject}` : `Could not ${action} ${failures.length} of ${items}`,
        description: describeFailures(failures),
        progress: undefined,
        duration: 0,
    };
}
