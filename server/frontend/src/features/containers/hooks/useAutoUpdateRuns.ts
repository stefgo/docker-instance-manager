import { useMemo } from "react";
import { ActivityRecord } from "@dim/shared";
import { useActivityStore } from "../../../stores/useActivityStore";

/** The event an agent reports once a run of its auto-update is over. */
export const AUTO_UPDATE_RUN_KIND = "autoupdate.run";

/**
 * The newest reported auto-update run per client, keyed by client id.
 *
 * It reads the activity events rather than asking the fleet endpoint in the settings: those
 * events are the very record that endpoint derives its figures from, the store already holds
 * them, and they arrive over the WebSocket -- so a run that reports itself moves the column
 * on its own, without a list anywhere polling for it.
 *
 * A host runs one schedule per project plus its own, and each of them reports separately.
 * What a client list wants is the last time this host did anything at all, so the newest of
 * them wins rather than one line per schedule -- the settings page is where the schedules
 * are read apart.
 */
export function useLatestAutoUpdateRuns(): Map<string, ActivityRecord> {
    const events = useActivityStore((s) => s.events);

    return useMemo(() => {
        const latest = new Map<string, ActivityRecord>();
        for (const event of events) {
            if (event.kind !== AUTO_UPDATE_RUN_KIND || !event.clientId) continue;
            const known = latest.get(event.clientId);
            // The store hands them over newest first, but that is its order, not a promise.
            if (!known || known.occurredAt < event.occurredAt) {
                latest.set(event.clientId, event);
            }
        }
        return latest;
    }, [events]);
}
