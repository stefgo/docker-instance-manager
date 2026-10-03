import { Monitor } from "lucide-react";
import { ReactNode, useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Client, CLIENT_STATUS } from "@dim/shared";
import { clientName, EMPTY_VALUE, formatDate } from "../../../utils";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { StatusDot } from "./StatusDot";
import { DataMultiView, type DataColumnDef } from "@stefgo/react-ui-components";
import { actionsColumn, listGroups } from "../../../components/listColumns";
import { useLatestAutoUpdateRuns } from "../../containers/hooks/useAutoUpdateRuns";

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

    // The table is the short reading -- name, and when an offline host was last seen -- and
    // the list the long one, so most columns belong to one view only.
    const columns: DataColumnDef<Client>[] = [
        {
            header: "Client",
            sortable: true,
            sortValue: (client) => clientName(client),
            list: { label: null },
            render: (client, view) => (
                <div className={view === "list" ? "flex items-center gap-2 py-1" : "flex items-center gap-3"}>
                    <StatusDot online={isOnline(client)} />
                    <div
                        className={`${view === "list" ? "" : "text-sm "}font-medium text-text-primary ${isOnline(client) ? "" : "opacity-70"} truncate`}
                    >
                        {clientName(client)}
                    </div>
                </div>
            ),
        },
        {
            header: null,
            table: { cellClassName: "align-top text-sm text-text-primary" },
            list: false,
            render: (client) =>
                !isOnline(client) ? (
                    <div className="whitespace-nowrap opacity-70">
                        Last Seen: {formatDate(client.lastSeen)}
                    </div>
                ) : null,
        },
        { header: "ID", accessorKey: "id", table: false },
        {
            header: "Version",
            table: false,
            render: (client) => <span className="text-sm text-text-primary">{client.version}</span>,
        },
        {
            header: "Capabilities",
            table: false,
            render: (client) => <CapabilitiesCell client={client} />,
        },
        {
            header: "Status",
            table: false,
            render: (client) =>
                !isOnline(client) ? (
                    <span className="text-sm text-text-muted">{formatDate(client.lastSeen)}</span>
                ) : (
                    <span className="text-success text-sm">Online</span>
                ),
        },
        {
            header: "Last Auto-Update",
            table: false,
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
            viewMode={{ persist: { key: "clientViewMode", scope: "local" } }}
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
