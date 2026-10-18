import { ACTIVITY_LEVELS, ActivityLevel, ActivityRecord, activityMessage, exitPhrase } from "@dim/shared";

/**
 * One row of the list: an event, plus the events that share its correlationId.
 *
 * Grouping is a lookup, not a guess. Whoever caused a group put its id on every member --
 * the agent stamps its run or the server's actionId on what it does, the server stamps the
 * same actionId on the request it sent. For those, nothing here matches names, and nothing
 * depends on the order or the timing of what arrives: an event delayed by an offline stretch
 * carries its own membership and lands in the right group hours later.
 *
 * One kind of row is a guess, and a narrow one: what a container went through in one go
 * without anyone here having caused it (`lifecycleTitle`). A `docker compose up` on the host
 * recreates a container in five events that carry no id, because the agent only watched.
 */
export interface ActivityGroup {
    head: ActivityRecord;
    members: ActivityRecord[];
    /** The most severe level in the group, so a failed step colours its head. */
    level: ActivityLevel;
    /** True while nobody in the group has been seen by the current user. */
    unseen: boolean;
    /**
     * Events of the group that are not shown, see `supersededIds`. Seeing the group sees
     * them too, or they would stay unseen with no row left to mark them from.
     */
    superseded: ActivityRecord[];
    /**
     * What the row says where no single event does: set on a folded lifecycle burst, and on
     * nothing else. Its head is then just the earliest step, so the steps of such a row are
     * the head and the members.
     */
    title?: string;
}

/** Which kinds stand for a whole operation and are therefore the head of their group. */
const GROUP_HEADS = new Set(["autoupdate.run", "action.requested"]);

/** What the agent reports once an action has ended, however late it gets through. */
const ACTION_OUTCOMES = new Set(["action.completed", "action.failed"]);

/**
 * The events a later one has overtaken: every `action.unconfirmed` whose group has since
 * received the agent's own outcome. The server wrote it because the answer did not come;
 * once it has, "result pending" is no longer true and must not colour the group or the badge.
 */
export function supersededIds(events: ActivityRecord[]): Set<string> {
    const settled = new Set<string>();
    for (const event of events) {
        if (event.correlationId && event.source === "agent" && ACTION_OUTCOMES.has(event.kind)) {
            settled.add(event.correlationId);
        }
    }
    const superseded = new Set<string>();
    if (settled.size === 0) return superseded;
    for (const event of events) {
        if (event.kind === "action.unconfirmed" && event.correlationId && settled.has(event.correlationId)) {
            superseded.add(event.id);
        }
    }
    return superseded;
}

/** What a container goes through when it is stopped, replaced or started. */
const LIFECYCLE_KINDS = new Set([
    "container.created",
    "container.started",
    "container.stopped",
    "container.died",
    "container.removed",
]);

/**
 * How far apart two neighbouring steps of one burst may be. A recreate is over in a few
 * seconds; ten leave room for a slow stop. The window only chains steps: a restart policy
 * starts a crashing container again within a second or two, so what keeps two runs apart is
 * `splitRuns`, not the window.
 */
export const LIFECYCLE_WINDOW_MS = 10_000;

/**
 * Cuts a chain of lifecycle steps, oldest first, into the runs of the container: every start
 * after the first begins a new one, and an exit between two starts ends the earlier run. A
 * crash loop is thereby one row per run, which `collapseRepeats` folds into one with a count,
 * however fast Docker restarts it. A recreate, a restart and a helper container that is
 * created, run and removed hold a single start each and stay whole.
 */
export function splitRuns(steps: ActivityRecord[]): ActivityRecord[][] {
    const runs: ActivityRecord[][] = [];
    let run: ActivityRecord[] = [];
    for (const step of steps) {
        if (step.kind === "container.started" && run.some((s) => s.kind === "container.started")) {
            runs.push(run);
            run = [];
        }
        run.push(step);
    }
    if (run.length > 0) runs.push(run);
    return runs;
}

/**
 * The container an uncorrelated lifecycle event may be folded under, or `null` for an event
 * that stays a row of its own. By host and name, not by id: a recreate gives the container a
 * new id and keeps its name.
 */
function lifecycleKey(event: ActivityRecord): string | null {
    if (event.correlationId || !LIFECYCLE_KINDS.has(event.kind)) return null;
    const containerName = event.subject?.containerName;
    return event.clientId && containerName ? `${event.clientId}\n${containerName}` : null;
}

/**
 * The step a run started in the burst ended with, or `undefined` while it still runs: its
 * last death, which carries the exit code, else its stop. A removal after it names the burst
 * by itself, so there is none then.
 */
function runEnding(steps: ActivityRecord[], started: number): ActivityRecord | undefined {
    if (started === -1) return undefined;
    const after = steps.slice(started + 1).reverse();
    if (after.some((step) => step.kind === "container.removed")) return undefined;
    return (
        after.find((step) => step.kind === "container.died") ??
        after.find((step) => step.kind === "container.stopped")
    );
}

/**
 * What a burst of lifecycle events amounted to, oldest first: a container that was removed
 * and created again was recreated, one that stopped and started was restarted. A run that
 * ended again within the burst says so, since that is where the container is now: a run that
 * is all of the burst by its exit alone ("exited with code 1"), any other by what came before
 * and the exit ("restarted, then exited with code 1"). Anything else is named by its last step.
 */
export function lifecycleTitle(steps: ActivityRecord[]): string {
    const first = steps[0];
    const name = first.subject?.containerName ?? "a container";
    const kinds = steps.map((step) => step.kind);
    const removed = kinds.indexOf("container.removed");
    const created = kinds.lastIndexOf("container.created");
    const ended = kinds.findIndex((kind) => kind === "container.stopped" || kind === "container.died");
    const started = kinds.lastIndexOf("container.started");

    const ending = runEnding(steps, started);
    if (ending) {
        if (started === 0) return activityMessage(ending);
        return `${lifecycleTitle(steps.slice(0, started + 1))}, then ${exitPhrase(ending)}`;
    }

    if (removed !== -1 && created > removed) return `Container ${name} recreated`;
    // A helper container: there and gone again within the burst.
    if (created !== -1 && removed > created) return `Container ${name} created and removed again`;
    if (created !== -1) return `Container ${name} created${started > created ? " and started" : ""}`;
    if (removed !== -1) return `Container ${name} removed`;
    if (ended !== -1 && started > ended) return `Container ${name} restarted`;
    return activityMessage(steps[steps.length - 1]);
}

function maxLevel(events: ActivityRecord[]): ActivityLevel {
    let worst: ActivityLevel = ACTIVITY_LEVELS[0];
    for (const event of events) {
        if (ACTIVITY_LEVELS.indexOf(event.level) > ACTIVITY_LEVELS.indexOf(worst)) {
            worst = event.level;
        }
    }
    return worst;
}

/**
 * Folds a flat, newest-first event list into rows.
 *
 * An event with no correlationId is a row of its own. Correlated events become one row
 * headed by the summarising event of the group; if that one has not arrived -- an action
 * whose request was cleared away, or a run still under way -- the earliest member stands in
 * for it, so no event can go missing because its head is absent.
 *
 * A superseded event (`supersededIds`) is left out: it only ever said that something else was
 * still to come, and that something is in the group now.
 *
 * Uncorrelated lifecycle events of one container on one host become one row as well, as long
 * as each lies within `LIFECYCLE_WINDOW_MS` of the next and they belong to one run of the
 * container (`splitRuns`). Correlated events are never taken into such a row: they already
 * say where they belong.
 */
export function groupActivity(events: ActivityRecord[]): ActivityGroup[] {
    const superseded = supersededIds(events);
    const byCorrelation = new Map<string, ActivityRecord[]>();
    const hiddenByCorrelation = new Map<string, ActivityRecord[]>();
    // The burst each container is in while the list is walked, newest step first.
    const openBursts = new Map<string, ActivityRecord[]>();
    const groups: ActivityGroup[] = [];
    // Placeholders keep the folded rows in the position of their first-seen member, so a
    // group does not jump to the top of the list every time it grows a step.
    const order: Array<{ event: ActivityRecord } | { correlationId: string } | { burst: ActivityRecord[] }> = [];

    for (const event of events) {
        if (superseded.has(event.id)) {
            // Superseded events always carry a correlationId -- that is what settled them.
            const key = event.correlationId as string;
            hiddenByCorrelation.set(key, [...(hiddenByCorrelation.get(key) ?? []), event]);
            continue;
        }
        const key = event.correlationId;
        if (!key) {
            const container = lifecycleKey(event);
            if (!container) {
                order.push({ event });
                continue;
            }
            const burst = openBursts.get(container);
            const neighbour = burst?.[burst.length - 1];
            if (
                burst && neighbour &&
                Math.abs(Date.parse(neighbour.occurredAt) - Date.parse(event.occurredAt)) <= LIFECYCLE_WINDOW_MS
            ) {
                burst.push(event);
            } else {
                const opened = [event];
                openBursts.set(container, opened);
                order.push({ burst: opened });
            }
            continue;
        }
        const existing = byCorrelation.get(key);
        if (existing) {
            existing.push(event);
        } else {
            byCorrelation.set(key, [event]);
            order.push({ correlationId: key });
        }
    }

    for (const entry of order) {
        if ("correlationId" in entry) {
            const members = byCorrelation.get(entry.correlationId) ?? [];
            if (members.length === 0) continue;
            // The list arrives newest first; a group reads oldest first, the way it ran.
            const ordered = [...members].reverse();
            const headIndex = ordered.findIndex((m) => GROUP_HEADS.has(m.kind));
            const head = headIndex === -1 ? ordered[0] : ordered[headIndex];
            groups.push({
                head,
                members: ordered.filter((m) => m.id !== head.id),
                level: maxLevel(ordered),
                unseen: ordered.some((m) => !m.seen),
                superseded: hiddenByCorrelation.get(entry.correlationId) ?? [],
            });
            continue;
        }
        if ("burst" in entry) {
            // Newest run first, like the list; the runs stay together, so the repeats of a
            // crash loop are neighbours whatever else happened in between.
            for (const run of splitRuns([...entry.burst].reverse()).reverse()) {
                groups.push(run.length > 1 ? burstGroup(run) : singleGroup(run[0]));
            }
            continue;
        }
        groups.push(singleGroup(entry.event));
    }

    return groups;
}

/** A row of its own for an event nothing was folded under. */
function singleGroup(event: ActivityRecord): ActivityGroup {
    return { head: event, members: [], level: event.level, unseen: !event.seen, superseded: [] };
}

/** A row for one run of a lifecycle burst, oldest step first. */
function burstGroup(steps: ActivityRecord[]): ActivityGroup {
    const [head, ...members] = steps;
    return {
        head,
        members,
        level: maxLevel(steps),
        unseen: steps.some((m) => !m.seen),
        superseded: [],
        title: lifecycleTitle(steps),
    };
}
