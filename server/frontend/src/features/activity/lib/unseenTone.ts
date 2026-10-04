import type { ActivityRecord } from "@dim/shared";
import { supersededIds } from "./groupActivity";

/** The events the user has not seen that ask for a look, by how loudly. */
export interface UnseenProblems {
    errors: number;
    warnings: number;
}

/**
 * Info and trace events never ask for a look, and neither does one a later event has
 * superseded (`supersededIds`): its row is gone, so it would be counted for nothing.
 * The card on the overview shows the numbers, the sidebar the tone they add up to.
 */
export function unseenProblems(events: ActivityRecord[]): UnseenProblems {
    const superseded = supersededIds(events);
    let errors = 0;
    let warnings = 0;
    for (const e of events) {
        if (e.seen || superseded.has(e.id)) continue;
        if (e.level === "error") errors++;
        else if (e.level === "warning") warnings++;
    }
    return { errors, warnings };
}

/** The most severe level among the events the user has not seen, if it is one that asks for a look. */
export type UnseenTone = "error" | "warning" | null;

/**
 * A string rather than the counts, so a component selecting it re-renders only when the
 * tone changes, not on every update of the list.
 */
export const problemTone = ({ errors, warnings }: UnseenProblems): UnseenTone =>
    errors > 0 ? "error" : warnings > 0 ? "warning" : null;

export const unseenTone = (events: ActivityRecord[]): UnseenTone => problemTone(unseenProblems(events));
