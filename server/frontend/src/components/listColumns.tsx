import type { ReactNode } from "react";
import type { DataColumnDef, DataListGroupDef } from "@stefgo/react-ui-components";

/** The id of the block the actions sit in, for a list that builds its actions column itself. */
export const ACTIONS_GROUP = "actions";

/**
 * The two blocks a row of the list view has in every list of the app: what the row says,
 * and its actions at the right edge. A column lands in the first unless it names the other.
 */
export const listGroups = (contentClassName = "flex-1"): DataListGroupDef[] => [
    { id: "content", className: contentClassName },
    { id: ACTIONS_GROUP, className: "md:text-right" },
];

/**
 * The actions of a row, as the last column of the table and the second block of the list.
 * `render` is the one set of buttons for both views; the list only centres it below the
 * fields on a narrow screen.
 */
export function actionsColumn<T>(
    render: (item: T) => ReactNode,
    listClassName = "mt-2 md:mt-0 flex justify-center",
): DataColumnDef<T> {
    return {
        header: "Actions",
        table: { headerClassName: "text-center", cellClassName: "content-center" },
        list: { label: null, group: ACTIONS_GROUP },
        render: (item, view) =>
            view === "list" ? <div className={listClassName}>{render(item)}</div> : render(item),
    };
}

/**
 * The blocks of a tree's row in the list view -- what a narrow screen shows in place of the
 * tree table. The row stays one line high where it can: what it says on the left, cut off
 * rather than wrapped, and its actions on the right, where a thumb reaches them without
 * scrolling sideways.
 */
export const treeListGroups = (): DataListGroupDef[] => [
    { id: "content", className: "flex-1 min-w-0" },
    { id: ACTIONS_GROUP, className: "shrink-0" },
];

/** Keeps the two blocks side by side on a narrow screen too, where a list stacks them. */
export const TREE_LIST = { colWrapper: "flex-row items-center gap-2" };

/**
 * For a tree that offers no other view: it is the tree table wherever that fits, and the
 * view switches to the list by itself where it does not. Spread it onto the view; it sets
 * `viewMode` and `classNames`.
 */
export const TREE_ONLY = {
    viewMode: { value: "tree" as const },
    classNames: { toggleRoot: "hidden", list: TREE_LIST },
};

/** The actions of a tree's row: as they are in the table, at the right edge in the list. */
export const treeActionsColumn = <T,>(render: (item: T) => ReactNode): DataColumnDef<T> =>
    actionsColumn(render, "flex justify-end");
