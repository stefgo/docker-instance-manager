import type { AutoUpdateState } from "@dim/shared";

/** The part of one schedule's stored state the summary is read from. */
export interface ScheduleTimes {
    lastRun: string | null;
    nextRun: string | null;
}

/** A stored time as a number, or null for one that is missing or does not parse. */
function timeOf(value: string | null): number | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}

/**
 * Where this host's schedules stand, as one answer: the newest run any of them finished and
 * the earliest one any of them has planned. A host runs one schedule per project plus its
 * own, but what the server shows per host is the last time it ran at all and the next time
 * it will -- so the schedules are folded together here rather than reported one by one.
 *
 * Times are compared as instants, not as strings, and handed back as ISO strings in UTC,
 * the form `AUTO_UPDATE_STATE` is checked against. A stored value that does not parse
 * counts as none.
 */
export function scheduleSummary(schedules: Iterable<ScheduleTimes>): AutoUpdateState {
    let lastRun: number | null = null;
    let nextRun: number | null = null;
    for (const schedule of schedules) {
        const last = timeOf(schedule.lastRun);
        if (last !== null && (lastRun === null || last > lastRun)) lastRun = last;
        const next = timeOf(schedule.nextRun);
        if (next !== null && (nextRun === null || next < nextRun)) nextRun = next;
    }
    return {
        lastRun: lastRun === null ? null : new Date(lastRun).toISOString(),
        nextRun: nextRun === null ? null : new Date(nextRun).toISOString(),
    };
}
