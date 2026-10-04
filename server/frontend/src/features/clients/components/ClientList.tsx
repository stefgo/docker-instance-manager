import { Monitor } from "lucide-react";
import { ReactNode, useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Client, CLIENT_STATUS } from "@dim/shared";
import { clientName, EMPTY_VALUE, formatDate, toTimestamp } from "../../../utils";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { onlineTone } from "../onlineTone";
import { DataMultiView, type DataColumnDef, StatusDot } from "@stefgo/react-ui-components";
import { actionsColumn, listGroups } from "../../../components/listColumns";
import { useLatestAutoUpdateRuns } from "../../containers/hooks/useAutoUpdateRuns";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { clientStatusOrder } from "../lib/clientStatus";
import { RelativeTime } from "../../../components/RelativeTime";

/**
 * What the connected agent says it can do, reported as it named it. Only the agent on the
 * wire can answer this -- capabilities belong to the build that is connected -- so an
 * offline client says nothing rather than guessing from a stored version.
 *
 * The cell reports rather than interprets: a capability the dashboard does not know still
 * shows up here, and nothing is turned into a verdict about a single one of them. Where a
 * missing capability calls for an action, the place that asks for it says so -- the fleet
 * view and the client's own auto-update schedule.
 */
const CapabilitiesCell = ({ client }: { client: Client }) => {
    if (client.status !== CLIENT_STATUS.ONLINE || client.capabilities == null) {
        return <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>;
    }
    if (client.capabilities.length === 0) {
        return <span className="text-sm text-text-muted">None</span>;
    }
    return (
        <span className="text-sm text-text-primary">{client.capabilities.join(", ")}</span>
    );
};

interface ClientListProps {
    clients: Client[];
    setSelectedClient?: (client: Client | null) => void;
    renderRowActions?: (client: Client) => ReactNode;
    extraActions?: ReactNode;
}

export const ClientList = ({
    clients,
    setSelectedClient,
    renderRowActions,
    extraActions,
}: ClientListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();
    const lastRuns = useLatestAutoUpdateRuns();

    /**
     * When this host last finished a run of its auto-update -- the agent's own clock, since
     * the run happened there. A host that has reported none says so rather than showing a
     * zero: "never seen a run" and "ran and changed nothing" are different answers.
     */
    const lastRunAt = (client: Client): string | null =>
        lastRuns.get(client.id)?.occurredAt ?? null;

    const sortedClients = useMemo(
        () => [...clients].sort((a, b) => clientName(a).localeCompare(clientName(b))),
        [clients],
    );

    const filteredClients = useMemo(() => {
        if (!searchQuery) return sortedClients;
        const q = searchQuery.toLowerCase();
        return sortedClients.filter(c =>
            (c.displayName ?? "").toLowerCase().includes(q) ||
            c.hostname.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q),
        );
    }, [sortedClients, searchQuery]);

    const isOnline = (client: Client) => client.status === CLIENT_STATUS.ONLINE;

    // Both views answer the same questions -- which host is gone, and which agent is behind --
    // so every column but the ID is in the table as well.
    const columns: DataColumnDef<Client>[] = [
        {
            header: "Client",
            sortable: true,
            sortValue: (client) => clientName(client),
            list: { label: null },
            render: (client, view) => (
                <div className={view === "list" ? "flex items-center gap-2 py-1" : "flex items-center gap-3"}>
                    <StatusDot tone={onlineTone(isOnline(client))} />
                    <div
                        className={`${view === "list" ? "" : "text-sm "}font-medium text-text-primary ${isOnline(client) ? "" : "opacity-70"} truncate`}
                    >
                        {clientName(client)}
                    </div>
                </div>
            ),
        },
        {
            header: "Status",
            sortable: true,
            sortValue: clientStatusOrder,
            table: { cellClassName: "whitespace-nowrap" },
            render: (client) =>
                !isOnline(client) ? (
                    <span className="text-sm text-text-muted">
                        {client.lastSeen ? <>Last seen <RelativeTime date={client.lastSeen} /></> : "Never connected"}
                    </span>
                ) : (
                    <span className="text-success text-sm">Online</span>
                ),
        },
        { header: "ID", accessorKey: "id", table: false },
        {
            header: "Version",
            sortable: true,
            sortValue: (client) => client.version ?? "",
            render: (client) =>
                client.version ? (
                    <span className="text-sm text-text-primary">{client.version}</span>
                ) : (
                    <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>
                ),
        },
        {
            header: "Capabilities",
            render: (client) => <CapabilitiesCell client={client} />,
        },
        {
            header: "Last Auto-Update",
            sortable: true,
            sortValue: (client) => toTimestamp(lastRunAt(client)) ?? 0,
            table: { cellClassName: "whitespace-nowrap" },
            render: (client) => {
                const at = lastRunAt(client);
                return at ? (
                    <span className="text-sm text-text-primary">{formatDate(at)}</span>
                ) : (
                    <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>
                );
            },
        },
        ...(renderRowActions
            ? [
                  actionsColumn<Client>((client) => (
                      <div onClick={(e) => e.stopPropagation()}>{renderRowActions(client)}</div>
                  )),
              ]
            : []),
    ];

    return (
        <DataMultiView
            title={
                <>
                    <Monitor size={18} className="text-text-muted" /> Clients
                </>
            }
            extraActions={extraActions}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: STORAGE_KEYS.clientsView, scope: "local" } }}
            data={filteredClients}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search clients…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No clients connected."
            rowClassName="align-top"
            onRowClick={setSelectedClient ?? undefined}
            // The view owns the page state and takes the page after sorting, so a column
            // sort covers every client, not just the ones on screen.
            pagination={pagination(PAGE_SIZE.page)}
        />
    );
};
