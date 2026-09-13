import { useEffect } from "react";
import { ActivityRecord } from "@dim/shared";
import { useToast } from "@stefgo/react-ui-components";
import type { ToastVariant } from "@stefgo/react-ui-components";
import { useActivityStore } from "../../../stores/useActivityStore";
import { activityDetail, activityMessage } from "../../activity/lib/activityText";
import { AUTO_UPDATE_RUN_KIND } from "./useAutoUpdateRuns";

/**
 * How long a run that was asked for is waited for before it is given up on.
 *
 * A run pulls images and recreates containers, and the agent may recreate its own container
 * on the way -- so the report can take minutes and, in the worst case, never arrives at all.
 * The "Last Auto-Update" column holds the answer either way; this only bounds the waiting.
 */
const RUN_RESULT_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingRun {
    /** The host as the operator named it, so the toast reads like the row they clicked. */
    name: string;
    /** When the command went out, by this browser's clock. */
    askedAt: string;
    timer: ReturnType<typeof setTimeout>;
}

/**
 * The hosts that were asked to run and have not reported back yet.
 *
 * Module state rather than a store or a component's ref: nothing renders from it, and the
 * wait has to outlive the surface that started it. A run takes minutes, and the operator
 * who asked for it is usually somewhere else by the time the agent answers.
 */
const pendingRuns = new Map<string, PendingRun>();

/** A run event's own verdict, in the vocabulary the toast speaks. */
function runVariant(event: ActivityRecord): ToastVariant {
    if (event.level === "error") return "error";
    if (event.level === "warning") return "warning";
    return "success";
}

/**
 * Notes that this host was asked to run, so `useAutoUpdateRunToasts` can speak for it once
 * the run reports. `onGivenUp` is raised when nothing came back in time.
 */
export function markAutoUpdateRunAsked(
    clientId: string,
    name: string,
    onGivenUp: (name: string) => void,
): void {
    // A second click while the first run is still out replaces the older wait rather than
    // adding to it: the host reports one run, and that report answers both.
    const previous = pendingRuns.get(clientId);
    if (previous) clearTimeout(previous.timer);

    pendingRuns.set(clientId, {
        name,
        askedAt: new Date().toISOString(),
        timer: setTimeout(() => {
            pendingRuns.delete(clientId);
            onGivenUp(name);
        }, RUN_RESULT_TIMEOUT_MS),
    });
}

/**
 * Turns the run an agent reports into a toast for whoever asked for it. Mounted once, in
 * the shell -- a run outlives the page it was started from.
 *
 * It subscribes to the activity store rather than reading it through a selector: a
 * render-time comparison would have to remember which events it has already spoken about,
 * while the subscription is handed exactly what changed, and only while somebody waits.
 *
 * The agent's clock decides what counts as the answer. A report older than the moment the
 * command went out belongs to the run before it -- a host that finished a scheduled run a
 * second earlier must not be mistaken for one that answered.
 */
export function useAutoUpdateRunToasts(): void {
    const { show } = useToast();

    useEffect(() => {
        return useActivityStore.subscribe((state, previous) => {
            if (pendingRuns.size === 0 || state.events === previous.events) return;
            for (const event of state.events) {
                if (event.kind !== AUTO_UPDATE_RUN_KIND || !event.clientId) continue;
                const waiting = pendingRuns.get(event.clientId);
                if (!waiting || event.occurredAt < waiting.askedAt) continue;
                clearTimeout(waiting.timer);
                pendingRuns.delete(event.clientId);
                show({
                    variant: runVariant(event),
                    title: `${waiting.name}: ${activityMessage(event)}`,
                    description: activityDetail(event) ?? undefined,
                });
            }
        });
    }, [show]);
}
