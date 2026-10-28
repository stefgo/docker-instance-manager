import type { AgentStatus } from "@dim/shared";

/**
 * What the auto-prune remembers between runs and restarts: the expression it planned, the
 * date that expression comes to next, and when a run last finished.
 *
 * Whether a run is under way is not stored. A missed or interrupted prune is not made up --
 * the next date clears up just the same -- so a start has nothing to learn from it.
 */
export interface PruneState {
    cron: string;
    nextRun: string | null;
    lastRun: string | null;
}

export const EMPTY_PRUNE_STATE: PruneState = { cron: "", nextRun: null, lastRun: null };

/** A time as UTC ISO text, or null for one that is missing or does not parse. */
function isoOrNull(value: unknown): string | null {
    if (typeof value !== "string" || !value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * The state as the file holds it. Anything that is not the expected shape counts as none,
 * field by field: a damaged `nextRun` must not cost the host its `lastRun`.
 */
export function readPruneState(stored: unknown): PruneState {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...EMPTY_PRUNE_STATE };
    const entry = stored as Record<string, unknown>;
    return {
        cron: typeof entry.cron === "string" ? entry.cron : "",
        nextRun: isoOrNull(entry.nextRun),
        lastRun: isoOrNull(entry.lastRun),
    };
}

/** What `AGENT_STATUS` reports about the auto-prune. */
export function pruneSummary(state: PruneState, runningSince: string | null): NonNullable<AgentStatus["autoPrune"]> {
    return {
        lastRun: isoOrNull(state.lastRun),
        nextRun: isoOrNull(state.nextRun),
        runningSince: isoOrNull(runningSince),
    };
}
