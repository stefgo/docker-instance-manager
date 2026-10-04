import { CLIENT_STATUS, type SchedulerId, type SchedulerStatuses } from "@dim/shared";
import type { UnseenProblems } from "../../activity/lib/unseenTone";
import type { ContainerNode } from "../../containers/lib/containerGroups";
import { plural } from "../../../utils";

/**
 * The numbers the overview's cards and the sidebar's badges both show. Counted here, once,
 * so the two cannot disagree about how many clients are online. The containers are counted
 * on the groups the container list shows, so a card and the list it leads to agree as well.
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
    instancesOf(groups).filter((instance) => instance.updateStatus === "update").length;

/**
 * The containers that do not run, on the hosts that are connected. A container of an
 * offline host is not counted: its last snapshot is not its present, and the card on the
 * clients says that the host is gone.
 */
export const notRunning = (groups: readonly ContainerNode[]): number =>
    instancesOf(groups).filter((instance) => instance.clientOnline && instance.containerState !== "running").length;

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
