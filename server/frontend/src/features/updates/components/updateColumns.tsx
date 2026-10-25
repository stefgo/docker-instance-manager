import type { DataColumnDef } from "@stefgo/react-ui-components";
import type { ContainerUpdateRecord } from "@dim/shared";
import { RelativeTime } from "../../../components/RelativeTime";
import type { ClientLookup } from "../lib/updateHistory";
import { ClientCell, ContainerCell, ResultIcon, TriggerBadge, VersionChangeText } from "./UpdateParts";

/**
 * The columns of an update, the same on the dashboard's card and the history page. Sorting is
 * the page's: the card shows the newest few in the order they come.
 */
export function updateColumns(clients: ClientLookup, { sortable }: { sortable: boolean }): DataColumnDef<ContainerUpdateRecord>[] {
    return [
        {
            header: <span className="sr-only">Result</span>,
            sortable,
            sortValue: (u) => u.result,
            table: { headerClassName: "w-px", cellClassName: "w-px align-top pt-3" },
            list: false,
            render: (u) => <ResultIcon update={u} />,
        },
        {
            header: "Container",
            sortable,
            sortValue: (u) => u.containerName.toLowerCase(),
            list: { label: null },
            render: (u, view) =>
                view === "list" ? (
                    <div className="flex items-start gap-2 py-1">
                        <span className="mt-0.5">
                            <ResultIcon update={u} />
                        </span>
                        <ContainerCell update={u} clients={clients} />
                    </div>
                ) : (
                    <ContainerCell update={u} clients={clients} />
                ),
        },
        {
            header: "Version",
            render: (u) => <VersionChangeText update={u} />,
        },
        {
            header: "Client",
            sortable,
            sortValue: (u) => clients.name(u.clientId).toLowerCase(),
            render: (u) => <ClientCell update={u} clients={clients} />,
        },
        {
            header: "Trigger",
            sortable,
            sortValue: (u) => u.trigger,
            table: { headerClassName: "w-px", cellClassName: "w-px" },
            render: (u) => <TriggerBadge trigger={u.trigger} />,
        },
        {
            header: "Time",
            sortable,
            sortValue: (u) => u.occurredAt,
            table: { headerClassName: "w-px whitespace-nowrap", cellClassName: "w-px whitespace-nowrap text-sm text-text-muted" },
            render: (u) => <RelativeTime date={u.occurredAt} seconds className="text-sm text-text-muted" />,
        },
    ];
}
