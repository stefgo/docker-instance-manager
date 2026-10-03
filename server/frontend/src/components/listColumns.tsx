import type { ReactNode } from "react";
import type { DataColumnDef, DataListGroupDef } from "@stefgo/react-ui-components";

const ACTIONS_GROUP = "actions";

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
