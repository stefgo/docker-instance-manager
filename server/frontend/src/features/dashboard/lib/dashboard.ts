import { CLIENT_STATUS } from "@dim/shared";
import type { UnseenProblems } from "../../activity/lib/unseenTone";
import type { ContainerNode } from "../../containers/lib/containerGroups";
import { matchesState, matchesUpdate } from "../../containers/lib/filterContainers";
import { EMPTY_VALUE, plural } from "../../../utils";

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
