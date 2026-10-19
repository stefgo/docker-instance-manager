import type { AgentStatus, AutoUpdateScheduleRun } from "@dim/shared";

/** The part of one schedule's stored state the summary is read from. */
export interface ScheduleTimes {
    lastRun: string | null;
    nextRun: string | null;
    startedAt: string | null;
}

/** The part a schedule's plan is read from. */
export interface SchedulePlan {
    cron: string;
    nextRun: string | null;
}

/** A stored time as a number, or null for one that is missing or does not parse. */
function timeOf(value: string | null): number | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}

function isoOf(time: number | null): string | null {
    return time === null ? null : new Date(time).toISOString();
}

/**
 * Where this host's schedules stand, as one answer: the newest run any of them finished, the
 * earliest one any of them has planned, and the earliest start of a run still under way. A
 * host runs one schedule per project plus its own, but what the server shows per host is the
 * last time it ran at all, the next time it will and whether it is running now -- so the
 * schedules are folded together here rather than reported one by one.
 *
 * Times are compared as instants, not as strings, and handed back as ISO strings in UTC,
 * the form `AGENT_STATUS` is checked against. A stored value that does not parse counts as
 * none.
 */
export function scheduleSummary(schedules: Iterable<ScheduleTimes>): AgentStatus["autoUpdate"] {
    let lastRun: number | null = null;
    let nextRun: number | null = null;
    let runningSince: number | null = null;
    for (const schedule of schedules) {
        const last = timeOf(schedule.lastRun);
        if (last !== null && (lastRun === null || last > lastRun)) lastRun = last;
        const next = timeOf(schedule.nextRun);
        if (next !== null && (nextRun === null || next < nextRun)) nextRun = next;
        const started = timeOf(schedule.startedAt);
        if (started !== null && (runningSince === null || started < runningSince)) runningSince = started;
    }
    return { lastRun: isoOf(lastRun), nextRun: isoOf(nextRun), runningSince: isoOf(runningSince) };
}

/**
 * The same plan schedule by schedule, for the dashboard to tell when a container's own
 * schedule fires: the folded `nextRun` above belongs to whichever schedule is earliest,
 * which for a container in a project is often another one.
 *
 * Sorted by name, so the report reads the same however the state happens to be ordered and
 * the `StateReporter` does not take a reordering for a change. A time that does not parse
 * is sent as none.
 */
export function schedulePlans(schedules: Record<string, SchedulePlan>): AutoUpdateScheduleRun[] {
    return Object.keys(schedules)
        .sort()
        .map((schedule) => ({
            schedule,
            cron: schedules[schedule].cron,
            nextRun: isoOf(timeOf(schedules[schedule].nextRun)),
        }));
}
