/**
 * The selection of a tree of two levels -- groups with the rows below them -- kept as the rows
 * below. A group is never picked for itself: its box follows from its rows, so it and the
 * boxes below it cannot disagree.
 */

type RowKey = string | number;

/** A group row; `children` are the rows the list shows under it. */
export interface TreeGroup<Leaf extends { id: RowKey }> {
    id: RowKey;
    children?: Leaf[] | null;
}

/**
 * The rows a selection stands for. A picked group stands for the rows shown under it -- with
 * a search or a filter set those are the ones it left. A row picked next to its group counts
 * once.
 */
export function selectedLeaves<Leaf extends { id: RowKey }>(
    groups: TreeGroup<Leaf>[],
    keys: ReadonlySet<RowKey>,
): Leaf[] {
    return groups.flatMap((group) => {
        const children = group.children ?? [];
        return keys.has(group.id) ? children : children.filter((child) => keys.has(child.id));
    });
}

/**
 * The selection as the list shows it, from the rows that are picked: a group is picked exactly
 * when every row shown under it is. A row a filter or the search has taken off the list is not
 * in it -- nothing is acted on behind the reader's back.
 */
export function shownSelection<Leaf extends { id: RowKey }>(
    groups: TreeGroup<Leaf>[],
    leafKeys: ReadonlySet<RowKey>,
): Set<RowKey> {
    const shown = new Set<RowKey>();
    for (const group of groups) {
        const children = group.children ?? [];
        const picked = children.filter((child) => leafKeys.has(child.id));
        picked.forEach((child) => shown.add(child.id));
        if (picked.length > 0 && picked.length === children.length) shown.add(group.id);
    }
    return shown;
}

/**
 * The rows picked after the list changed the selection to `next`. A group that was ticked
 * takes every row under it along, one that was unticked lets them all go; a row changes by
 * itself, and its group follows from that (`shownSelection`).
 */
export function changeSelection<Leaf extends { id: RowKey }>(
    groups: TreeGroup<Leaf>[],
    leafKeys: ReadonlySet<RowKey>,
    next: ReadonlySet<RowKey>,
): Set<RowKey> {
    const before = shownSelection(groups, leafKeys);
    const result = new Set<RowKey>();
    for (const group of groups) {
        const ticked = next.has(group.id) && !before.has(group.id);
        const unticked = !next.has(group.id) && before.has(group.id);
        for (const child of group.children ?? []) {
            if (ticked || (!unticked && next.has(child.id))) result.add(child.id);
        }
    }
    return result;
}
