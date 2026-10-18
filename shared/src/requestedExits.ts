import { ACTIVITY_LEVELS } from "./constants.js";
import type { ActivityEvent } from "./types.js";

/**
 * How long after a signal an exit still counts as its answer. A stop waits for the container
 * as long as its stop timeout, ten seconds unless a compose file sets a longer
 * `stop_grace_period`, and the SIGKILL after that is followed by the exit at once.
 */
export const REQUESTED_EXIT_WINDOW_MS = 60_000;

/**
 * The kinds that decide whether an exit answers a signal: the signal itself, and what ends
 * the wait for an answer -- the answer, a start or a removal.
 */
export const SIGNAL_STEPS = ["container.killed", "container.died", "container.started", "container.removed"];

type Step = Pick<ActivityEvent, "kind" | "level" | "occurredAt" | "subject" | "data">;

/** The container an event is about, by id and else by name, or `null` for one about none. */
function containerKey(event: Step): string | null {
    const id = event.subject?.containerId;
    if (id) return `id:${id}`;
    const name = event.subject?.containerName;
    return name ? `name:${name}` : null;
}

/**
 * Marks the exits somebody asked for in a batch from one agent: every `container.died` that
 * followed a `container.killed` of the same container within `REQUESTED_EXIT_WINDOW_MS`, with
 * no other step of `SIGNAL_STEPS` in between. Such an exit is stored at no more than `info`
 * and with `requested: true`.
 *
 * Docker reports a kill whenever a client of its API ends a container -- `docker stop`,
 * `docker rm -f`, `compose down`, a recreate, and every stop, restart and removal DIM itself
 * sends -- and never when the container ends by itself or runs out of memory. A container
 * that was stopped did what it was told, on whatever code its process ends with on SIGTERM.
 *
 * The batch is read in the order of its clocks, the batch's own order breaking a tie. An exit
 * whose container has no step earlier in the batch is decided by `signalledBefore`, which
 * looks at what was stored from earlier batches.
 *
 * A kill that only sends a reload signal (SIGHUP) and is followed by a real crash within the
 * window would excuse that crash. The signal does not tell the two apart: a container may
 * declare any signal as the one it stops on.
 */
export function markRequestedExits<T extends Step>(events: T[], signalledBefore: (died: T) => boolean): T[] {
    const requested = new Set<T>();
    // The last step of each container seen so far in the batch.
    const last = new Map<string, Step>();
    const ordered = events
        .map((event, index) => ({ event, index, at: Date.parse(event.occurredAt) }))
        .sort((a, b) => a.at - b.at || a.index - b.index);
    for (const { event, at } of ordered) {
        if (!SIGNAL_STEPS.includes(event.kind)) continue;
        const key = containerKey(event);
        if (!key) continue;
        if (event.kind === "container.died") {
            const before = last.get(key);
            const answers = before
                ? before.kind === "container.killed" && at - Date.parse(before.occurredAt) <= REQUESTED_EXIT_WINDOW_MS
                : signalledBefore(event);
            if (answers) requested.add(event);
        }
        last.set(key, event);
    }
    if (requested.size === 0) return events;
    const info = ACTIVITY_LEVELS.indexOf("info");
    return events.map((event) =>
        requested.has(event)
            ? {
                  ...event,
                  level: ACTIVITY_LEVELS.indexOf(event.level) > info ? "info" : event.level,
                  data: { ...event.data, requested: true },
              }
            : event,
    );
}
