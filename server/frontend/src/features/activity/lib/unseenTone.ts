import type { ActivityRecord } from "@dim/shared";
import { supersededIds } from "./groupActivity";

/** The most severe level among the events the user has not seen, if it is one that asks for a look. */
export type UnseenTone = "error" | "warning" | null;

/**
 * Info and trace events never ask for a look, and neither does one a later event has
 * superseded (`supersededIds`): its row is gone, so it would colour the badge for nothing.
 *
 * Returns a string rather than a list, so a component selecting it re-renders only when the
 * tone changes, not on every update of the list.
 */
export function unseenTone(events: ActivityRecord[]): UnseenTone {
    let tone: UnseenTone = null;
    const superseded = supersededIds(events);
    for (const e of events) {
        if (e.seen || superseded.has(e.id)) continue;
        if (e.level === "error") return "error";
        if (e.level === "warning") tone = "warning";
    }
    return tone;
}
