import type { PullTarget } from "../../images/confirmations";
import { startTargets, stopTargets } from "../containerState";
import type { ClientNode, ContainerInstance, ContainerNode } from "./containerGroups";

type RowKey = string | number;

/**
 * The host rows a selection stands for. A picked group stands for the host rows shown under
 * it -- with a filter set those are the ones the filter left, so "everything that has an
 * update" is what the list shows and not the rest of each group as well. A host row picked
 * next to its group counts once.
 */
export function selectedHostRows(groups: ContainerNode[], keys: ReadonlySet<RowKey>): ClientNode[] {
    return groups.flatMap((group) => {
        const children = group.children ?? [];
        return keys.has(group.id) ? children : children.filter((child) => keys.has(child.id));
    });
}

/**
 * The selection as the list shows it, from the host rows that are picked. Host rows are what
 * is kept: a group is picked exactly when every host row shown under it is, so its box and
 * the boxes below it cannot disagree. A row a filter or the search has taken off the list is
 * not in it -- nothing is acted on behind the reader's back.
 */
export function shownSelection(groups: ContainerNode[], hostKeys: ReadonlySet<RowKey>): Set<RowKey> {
    const shown = new Set<RowKey>();
    for (const group of groups) {
        const picked = (group.children ?? []).filter((child) => hostKeys.has(child.id));
        picked.forEach((child) => shown.add(child.id));
        if (picked.length > 0 && picked.length === group.children?.length) shown.add(group.id);
    }
    return shown;
}

/**
 * The host rows picked after the list changed the selection to `next`. A group that was
 * ticked takes every host row under it along, one that was unticked lets them all go; a
 * host row changes by itself, and its group follows from that (`shownSelection`).
 */
export function changeSelection(
    groups: ContainerNode[],
    hostKeys: ReadonlySet<RowKey>,
    next: ReadonlySet<RowKey>,
): Set<RowKey> {
    const before = shownSelection(groups, hostKeys);
    const result = new Set<RowKey>();
    for (const group of groups) {
        const children = group.children ?? [];
        const ticked = next.has(group.id) && !before.has(group.id);
        const unticked = !next.has(group.id) && before.has(group.id);
        for (const child of children) {
            if (ticked || (!unticked && next.has(child.id))) result.add(child.id);
        }
    }
    return result;
}

/** What each action of the selection bar would reach. An empty list disables its button. */
export interface SelectionPlan {
    /** The host rows the selection stands for, reachable or not -- what the bar counts. */
    rows: number;
    /** One check per image reference; hosts on the same reference share their answer. */
    check: { imageRef: string; repoDigests: string[] }[];
    /** One pull per reference: the connected hosts that are behind, and the containers picked there. */
    pull: PullTarget[];
    start: ContainerInstance[];
    stop: ContainerInstance[];
}

/**
 * Turns a selection into what its actions send. Start and stop follow the rule of a single
 * row (`startTargets`, `stopTargets`), so an offline host is in none of the lists. A pull is
 * limited to the picked containers, as a row's own pull is: without the list the agent
 * recreates every container on the image.
 */
export function planSelection(groups: ContainerNode[], keys: ReadonlySet<RowKey>): SelectionPlan {
    const rows = selectedHostRows(groups, keys);

    const checks = new Map<string, Set<string>>();
    const pulls = new Map<string, Record<string, string[]>>();
    for (const row of rows) {
        const digests = checks.get(row.configImage) ?? new Set<string>();
        row.repoDigests.forEach((digest) => digests.add(digest));
        checks.set(row.configImage, digests);

        if (row.clientOnline && row.updateStatus === "update") {
            const containerIds = pulls.get(row.configImage) ?? {};
            (containerIds[row.clientId] ??= []).push(row.containerId);
            pulls.set(row.configImage, containerIds);
        }
    }

    return {
        rows: rows.length,
        check: [...checks].map(([imageRef, digests]) => ({ imageRef, repoDigests: [...digests] })),
        pull: [...pulls].map(([imageRef, containerIds]) => ({
            imageRef,
            clientIds: Object.keys(containerIds),
            containerIds,
        })),
        start: rows.flatMap(startTargets),
        stop: rows.flatMap(stopTargets),
    };
}
