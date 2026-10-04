import type { To } from "react-router-dom";
import {
    type ActivityRecord,
    CLIENT_STATUS,
    type SchedulerId,
    type SchedulerStatuses,
    activityMessage,
} from "@dim/shared";
import { supersededIds } from "../../activity/lib/groupActivity";
import type { UnseenProblems } from "../../activity/lib/unseenTone";
import type { ContainerNode } from "../../containers/lib/containerGroups";
import { matchesState, matchesUpdate } from "../../containers/lib/filterContainers";
import { ROUTES, containersFiltered, paths } from "../../../lib/paths";
import { EMPTY_VALUE, clientName, plural } from "../../../utils";

/**
 * The numbers the overview's cards and the sidebar's badges both show. Counted here, once,
 * so the two cannot disagree about how many clients are online. The containers are counted
 * on the groups the container list shows and with the predicates its filters use, so a card
 * and the filtered list it leads to agree as well.
 */

export interface OnlineCount {
    online: number;
    total: number;
}

export const clientCount = (clients: readonly { status?: string | null }[]): OnlineCount => ({
    online: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
    total: clients.length,
});

/** `3 / 5`, as a card and a badge write it. */
export const formatOnlineCount = ({ online, total }: OnlineCount): string => `${online} / ${total}`;

const instancesOf = (groups: readonly ContainerNode[]) => groups.flatMap((group) => group.children ?? []);

/** Every container of the fleet, one per host it sits on. */
export const containerCount = (groups: readonly ContainerNode[]): number => instancesOf(groups).length;

/** The containers whose host found a newer image behind their tag. */
export const updatesAvailable = (groups: readonly ContainerNode[]): number =>
    instancesOf(groups).filter((instance) => matchesUpdate(instance, "update")).length;

/**
 * The containers that do not run, on the hosts that are connected. A container of an
 * offline host is not counted: its last snapshot is not its present, and the card on the
 * clients says that the host is gone.
 */
export const notRunning = (groups: readonly ContainerNode[]): number =>
    instancesOf(groups).filter((instance) => matchesState(instance, "not-running")).length;

/**
 * The same updates, on the hosts that are not connected. They are counted above -- a host
 * that went away is still behind -- but nothing can be done about them until it is back,
 * and the card says how many of its number that is.
 */
export const updatesOnOfflineHosts = (groups: readonly ContainerNode[]): number =>
    instancesOf(groups).filter((instance) => matchesUpdate(instance, "update") && !instance.clientOnline).length;

/** What a card shows: its number and the line below it. */
export interface CardReading {
    value: string;
    sub: string;
}

/** "Updates available": the count, and how much of it sits where nothing can be done. */
export function updatesReading(groups: readonly ContainerNode[]): CardReading {
    const offline = updatesOnOfflineHosts(groups);
    return {
        value: String(updatesAvailable(groups)),
        sub: offline > 0 ? `${offline} on offline clients` : `Across ${plural(containerCount(groups), "container")}`,
    };
}

/**
 * "Containers not running". With no client connected there is nothing the count could be
 * read off, and a zero would say that everything runs.
 */
export function notRunningReading(groups: readonly ContainerNode[], clients: OnlineCount): CardReading {
    if (clients.online === 0) return { value: EMPTY_VALUE, sub: "No client is online" };
    return { value: String(notRunning(groups)), sub: "On clients that are online" };
}

/**
 * What the "Errors / Warnings" card says below its number: what the number is made of.
 * A part that is zero is left out, and with nothing unseen the card says that instead.
 */
export function problemSummary({ errors, warnings }: UnseenProblems): string {
    const parts = [
        errors > 0 ? plural(errors, "error") : null,
        warnings > 0 ? plural(warnings, "warning") : null,
    ].filter((part) => part !== null);
    return parts.length > 0 ? parts.join(" · ") : "Nothing to report";
}

export const SCHEDULER_LABELS: Record<SchedulerId, string> = {
    "image-update-check": "Image update check",
    "image-cache-cleanup": "Image cache cleanup",
    "notification-cleanup": "Activity cleanup",
    "token-cleanup": "Token cleanup",
};

export interface NextRun {
    scheduler: SchedulerId;
    at: string;
}

/**
 * The run that comes first among the schedulers the server runs. `null` while none has one
 * planned. The agents' auto-update is not among them: every host runs its own on its own
 * clock.
 */
export function nextSchedulerRun(statuses: Partial<SchedulerStatuses>): NextRun | null {
    let next: NextRun | null = null;
    for (const [scheduler, status] of Object.entries(statuses) as [SchedulerId, { nextRun: string | null }][]) {
        const at = status?.nextRun;
        if (!at) continue;
        if (!next || Date.parse(at) < Date.parse(next.at)) next = { scheduler, at };
    }
    return next;
}

/** How many rows a group of the "Needs attention" list shows before it says "more". */
export const ATTENTION_LIMIT = 5;

export interface AttentionItem {
    key: string;
    label: string;
    /** What the label is about: the host of a container. */
    detail?: string;
    /** A moment the row is about, formatted where it is shown. */
    at?: string | null;
    to: To;
}

export interface AttentionGroup {
    id: "clients" | "updates" | "errors";
    title: string;
    /** At most `ATTENTION_LIMIT` rows. */
    items: AttentionItem[];
    /** How many rows were left out. */
    more: number;
    /** The list that shows all of them. */
    to: To;
}

function attentionGroup(
    id: AttentionGroup["id"],
    title: string,
    to: To,
    items: AttentionItem[],
): AttentionGroup[] {
    if (items.length === 0) return [];
    return [{ id, title, to, items: items.slice(0, ATTENTION_LIMIT), more: Math.max(0, items.length - ATTENTION_LIMIT) }];
}

/**
 * What needs a look, by name: the clients that are gone, the containers that are behind, the
 * errors nobody has seen. The cards above count the same things with the same predicates, so
 * a list is never longer or shorter than its card says -- it only stops after a few rows and
 * leads to the page that has the rest. A group with nothing in it is left out.
 *
 * An update on a host that is connected comes first: that one can be acted on.
 */
export function needsAttention({
    clients,
    groups,
    events,
}: {
    clients: readonly { id: string; status?: string | null; lastSeen?: string | null; displayName?: string | null; hostname: string }[];
    groups: readonly ContainerNode[];
    events: readonly ActivityRecord[];
}): AttentionGroup[] {
    const offline = clients
        .filter((c) => c.status !== CLIENT_STATUS.ONLINE)
        .map((c) => ({ key: c.id, label: clientName(c), at: c.lastSeen, to: paths.client(c.id) }));

    const behind = instancesOf(groups).filter((instance) => matchesUpdate(instance, "update"));
    const updates = [...behind.filter((i) => i.clientOnline), ...behind.filter((i) => !i.clientOnline)].map(
        (instance) => ({
            key: instance.id,
            label: instance.containerName,
            detail: instance.clientOnline ? instance.clientName : `${instance.clientName} (offline)`,
            to: paths.containerInstance(instance.clientId, instance.containerName),
        }),
    );

    const superseded = supersededIds([...events]);
    const errors = events
        .filter((e) => !e.seen && e.level === "error" && !superseded.has(e.id))
        .map((e) => ({ key: e.id, label: activityMessage(e), at: e.occurredAt, to: ROUTES.activity }));

    return [
        ...attentionGroup("clients", "Offline clients", ROUTES.clients, offline),
        ...attentionGroup("updates", "Updates available", containersFiltered({ update: "update" }), updates),
        ...attentionGroup("errors", "Unseen errors", ROUTES.activity, errors),
    ];
}
