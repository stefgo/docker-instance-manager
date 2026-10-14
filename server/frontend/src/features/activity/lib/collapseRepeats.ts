import { type ActivityRecord, activityMessage } from "@dim/shared";
import type { ActivityGroup } from "./groupActivity";
import { formatDate, formatTime } from "../../../utils";

/**
 * A row of the list as it is shown: a group, plus the groups right below it that say the
 * same about the same thing. A container that keeps dying reads as one row with a count
 * instead of the same sentence four times.
 */
export interface ActivityRow extends ActivityGroup {
    /** The earlier occurrences, in the order of the list. The row itself is the first. */
    repeats: ActivityGroup[];
}

/**
 * What makes two rows the same to a reader: the sentence, the kind it was phrased from, the
 * host and what it is about, the level, and whether it has been seen -- a seen row and an
 * unseen one look different and are marked differently, so they stay two.
 *
 * `null` for a correlated group with steps: an action or a run is told apart by what it did,
 * which the sentence of its head does not say.
 */
function signature(group: ActivityGroup): string | null {
    if (!group.title && group.members.length > 0) return null;
    const { head } = group;
    return JSON.stringify([
        group.title ?? activityMessage(head),
        group.title ? null : head.kind,
        group.level,
        group.unseen,
        head.clientId ?? null,
        head.subject?.containerName ?? null,
        head.subject?.imageRef ?? null,
        head.subject?.projectName ?? null,
    ]);
}

/**
 * Folds neighbouring rows that repeat each other. Neighbours in the list it is given, so it
 * runs after the filters and the search: what they take away no longer stands between two
 * repeats. Nothing is matched across a row that says something else.
 */
export function collapseRepeats(groups: readonly ActivityGroup[]): ActivityRow[] {
    const rows: ActivityRow[] = [];
    let open: string | null = null;
    for (const group of groups) {
        const key = signature(group);
        const last = rows[rows.length - 1];
        if (key !== null && key === open && last) {
            last.repeats.push(group);
            continue;
        }
        rows.push({ ...group, repeats: [] });
        open = key;
    }
    return rows;
}

/** Every event a row stands for, hidden ones included: what "Mark as seen" has to cover. */
export const rowEvents = (row: ActivityRow): ActivityRecord[] =>
    [row, ...row.repeats].flatMap((group) => [group.head, ...group.members, ...group.superseded]);

/** Up to this many earlier occurrences are named one by one; more are summed up. */
export const LISTED_REPEATS = 5;

/** How many of the latest occurrences a summed-up row still names. */
const LATEST_REPEATS = 3;

/** A gap between two occurrences, as roughly as a reader needs it. */
function formatInterval(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 90) return `${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} h`;
    return `${Math.round(hours / 24)} d`;
}

/**
 * The line under an expanded row that says when else it happened. A few repeats are named
 * one by one. A container caught in a restart loop repeats hundreds of times, and a list of
 * hundreds of dates says nothing, so the latest few are named and the rest is summed up: how
 * many, back to when, and how often -- which is what tells a loop apart from bad luck. The
 * date is written once when every occurrence falls on the same day.
 */
export function describeRepeats(repeats: readonly ActivityGroup[], locale?: string): string {
    // Newest first, whatever order the list is sorted in.
    const times = repeats
        .map((repeat) => new Date(repeat.head.occurredAt))
        .sort((a, b) => b.getTime() - a.getTime());
    if (times.length <= LISTED_REPEATS) {
        return `Also ${times.map((at) => formatDate(at, { seconds: true, locale })).join(" · ")}`;
    }
    const latest = times[0];
    const earliest = times[times.length - 1];
    const sameDay = latest.toDateString() === earliest.toDateString();
    const listed = times
        .slice(0, LATEST_REPEATS)
        .map((at) => (sameDay ? formatTime(at, locale) : formatDate(at, { seconds: true, locale })));
    const interval = (latest.getTime() - earliest.getTime()) / (times.length - 1);
    return (
        `Also ${listed.join(" · ")} and ${times.length - LATEST_REPEATS} more ` +
        `back to ${formatDate(earliest, { seconds: true, locale })}, about every ${formatInterval(interval)}`
    );
}
