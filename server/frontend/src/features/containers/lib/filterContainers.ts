import {
    CONTAINER_STATE_FILTERS,
    CONTAINER_UPDATE_FILTERS,
    type ContainerStateFilter,
    type ContainerUpdateFilter,
} from "../../../lib/paths";
import type { ClientNode, ContainerNode } from "./containerGroups";

/**
 * What the filters of the container list let through. They work on the instances -- one
 * container on one host -- because that is what the overview counts: a group that has an
 * update on one of three hosts is one update, not three. The cards count with the same two
 * predicates (`features/dashboard/lib/dashboard.ts`), so the number on a card is the number
 * of host rows the list shows once the card has been followed.
 */

/**
 * Whether an instance is in `state`. A host that is not connected is `unknown` and nothing
 * else: its last snapshot is not its present, so it neither runs nor stands still.
 */
export function matchesState(instance: ClientNode, state: ContainerStateFilter): boolean {
    switch (state) {
        case "all": return true;
        case "running": return instance.clientOnline && instance.containerState === "running";
        case "not-running": return instance.clientOnline && instance.containerState !== "running";
        case "unknown": return !instance.clientOnline;
    }
}

/**
 * Whether an instance has the update status asked for. An image there is nothing to check
 * for matches no filter but `all`.
 */
export const matchesUpdate = (instance: ClientNode, update: ContainerUpdateFilter): boolean =>
    update === "all" || instance.updateStatus === update;

const oneOf = <T extends string>(values: readonly T[], value: string | null | undefined): T =>
    values.find((v) => v === value) ?? values[0];

/** A filter as the address bar holds it; anything it does not know reads as no filter. */
export const parseStateFilter = (value: string | null | undefined): ContainerStateFilter =>
    oneOf(CONTAINER_STATE_FILTERS, value);

export const parseUpdateFilter = (value: string | null | undefined): ContainerUpdateFilter =>
    oneOf(CONTAINER_UPDATE_FILTERS, value);

export interface ContainerFilter {
    query?: string;
    state?: ContainerStateFilter;
    update?: ContainerUpdateFilter;
}

/**
 * The container groups as the list shows them for a search and the two filters.
 *
 * The search reads a group's name and image and the names of its hosts: a group that
 * matches keeps every host, one that does not keeps the hosts that do. The filters then
 * take away the instances they do not let through, and a group left with none goes. A group
 * that keeps only some of its hosts still shows what it is as a whole -- its state and
 * status are the group's, not those of the rows below it.
 */
export function filterContainers(
    groups: readonly ContainerNode[],
    { query = "", state = "all", update = "all" }: ContainerFilter,
): ContainerNode[] {
    const q = query.trim().toLowerCase();
    if (!q && state === "all" && update === "all") return [...groups];

    return groups.flatMap((group) => {
        const all = group.children ?? [];
        const groupMatches = !q || group.name.toLowerCase().includes(q) || group.configImage.toLowerCase().includes(q);
        const kept = all.filter(
            (instance) =>
                (groupMatches || instance.clientName.toLowerCase().includes(q)) &&
                matchesState(instance, state) &&
                matchesUpdate(instance, update),
        );
        if (kept.length === 0) return [];
        return [kept.length === all.length ? group : { ...group, children: kept }];
    });
}
