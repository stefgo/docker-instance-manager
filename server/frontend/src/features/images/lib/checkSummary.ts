import { EMPTY_VALUE, formatDate } from "../../../utils";

/** One host's answer, as both detail pages hold it. */
export interface CheckAnswer {
    checkedAt?: string;
    error?: string;
}

/**
 * Sums up what the registry last said about an image across the hosts that run it.
 *
 * The update indicator turns an error into `unchecked` and says no more; this is what the
 * detail page puts underneath it. The timestamp is the newest of the answers -- an older
 * one is not what the page means by "last checked" -- and the result is the error, if any
 * host got one, with the count where not all of them did.
 */
export function summarizeChecks(answers: CheckAnswer[]): { lastChecked: string; result: string | null } {
    const checked = answers.filter((a): a is CheckAnswer & { checkedAt: string } => !!a.checkedAt);
    if (checked.length === 0) return { lastChecked: EMPTY_VALUE, result: null };

    const lastChecked = formatDate([...checked].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).pop()!.checkedAt);
    const failed = checked.filter((a) => !!a.error);
    if (failed.length === 0) return { lastChecked, result: "OK" };

    // The hosts of one container run the same tag, so their errors agree in all but the
    // rare case of a registry answering two of them differently; the first one stands for
    // the rest, and the count says how many it stands for.
    const error = failed[0].error!;
    return {
        lastChecked,
        result: failed.length === checked.length ? error : `${error} (${failed.length} of ${checked.length} hosts)`,
    };
}
