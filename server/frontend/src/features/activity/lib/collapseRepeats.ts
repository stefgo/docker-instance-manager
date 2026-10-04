import { type ActivityRecord, activityMessage } from "@dim/shared";
import type { ActivityGroup } from "./groupActivity";

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
