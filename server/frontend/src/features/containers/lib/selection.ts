import type { PullTarget } from "../../images/confirmations";
import { startTargets, stopTargets } from "../containerState";
import type { ClientNode, ContainerInstance, ContainerNode } from "./containerGroups";
import {
    changeSelection as changeTreeSelection,
    selectedLeaves,
    shownSelection as shownTreeSelection,
} from "../../../lib/treeSelection";

type RowKey = string | number;

/**
 * The host rows a selection stands for. A picked group stands for the host rows shown under
 * it -- with a filter set those are the ones the filter left, so "everything that has an
 * update" is what the list shows and not the rest of each group as well. A host row picked
 * next to its group counts once.
 */
export const selectedHostRows = (groups: ContainerNode[], keys: ReadonlySet<RowKey>): ClientNode[] =>
    selectedLeaves(groups, keys);

/**
 * The selection as the list shows it, from the host rows that are picked: a group is picked
 * exactly when every host row shown under it is (`treeSelection`).
 */
export const shownSelection = (groups: ContainerNode[], hostKeys: ReadonlySet<RowKey>): Set<RowKey> =>
    shownTreeSelection(groups, hostKeys);

/**
 * The host rows picked after the list changed the selection to `next`. A group that was
 * ticked takes every host row under it along, one that was unticked lets them all go.
 */
export const changeSelection = (
    groups: ContainerNode[],
    hostKeys: ReadonlySet<RowKey>,
    next: ReadonlySet<RowKey>,
): Set<RowKey> => changeTreeSelection(groups, hostKeys, next);

/** What each header action would reach of the selection. An empty list disables its button. */
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
