import { Monitor } from "lucide-react";
import { ReactNode, useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Client, CLIENT_STATUS } from "@dim/shared";
import { clientName, EMPTY_VALUE, formatDate, toTimestamp } from "../../../utils";
import { onlineTone } from "../onlineTone";
import { Badge, DataMultiView, EmptyState, type DataColumnDef, StatusDot, PAGE_SIZE, listPagination, actionsColumn, listGroups } from "@stefgo/react-ui-components";
import { useDockerStates } from "../../../queries/docker";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { clientStatusOrder } from "../lib/clientStatus";
import { awaitsRegistration } from "../lib/registration";
import { RelativeTime } from "../../../components/RelativeTime";
import { listScope, type ListScope } from "../../../lib/listScope";

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
    /**
     * The header's buttons, given the clients the search leaves: the search is kept here,
     * and a button there acts on what the list shows.
     */
    extraActions?: (shown: Client[], scope: ListScope) => ReactNode;
}

// Handed to the view instead of applied in front of it: only then can the view tell a search
// without a hit from a list with nothing in it.
const matchesSearch = (c: Client, query: string) => {
    const q = query.toLowerCase();
    return (
        (c.displayName ?? "").toLowerCase().includes(q) ||
        c.hostname.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
};

export const ClientList = ({
    clients,
    setSelectedClient,
    renderRowActions,
    extraActions,
}: ClientListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();
    const dockerStates = useDockerStates();

    /** When this host last reported its Docker state -- what a reload moves on. */
    const dockerStateAt = (client: Client): string | null => dockerStates[client.id]?.updatedAt ?? null;

    /**
     * When this host last finished a run of its auto-update -- the agent's own clock, since
     * the run happened there. Any of its schedules counts, and so does a run that changed
     * nothing: that one reports no event, so the time comes from the client as the server
     * stores it, not from the activity.
     */
    const lastRunAt = (client: Client): string | null => client.autoUpdateLastRun ?? null;

    const sortedClients = useMemo(
        () => [...clients].sort((a, b) => clientName(a).localeCompare(clientName(b))),
        [clients],
    );

    const isOnline = (client: Client) => client.status === CLIENT_STATUS.ONLINE;

    // The table answers which host is gone and when it last updated or pruned. What the agent is --
    // its ID, version and capabilities -- is in the list view only.
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
                        {client.lastSeen ? (
                            <>Last seen <RelativeTime date={client.lastSeen} /></>
                        ) : awaitsRegistration(client) ? (
                            "Awaiting registration"
                        ) : (
                            "Never connected"
                        )}
                    </span>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        <Badge variant="success">Online</Badge>
                        {client.docker?.reachable === false && <Badge variant="warning">Docker unreachable</Badge>}
                    </div>
                ),
        },
        { header: "ID", accessorKey: "id", table: false },
        {
            header: "Version",
            table: false,
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
            table: false,
            render: (client) => <CapabilitiesCell client={client} />,
        },
        {
            header: "Docker State",
            sortable: true,
            sortValue: (client) => toTimestamp(dockerStateAt(client)) ?? 0,
            table: { cellClassName: "whitespace-nowrap" },
            render: (client) => {
                const at = dockerStateAt(client);
                // With seconds: a reload that answers within the minute still shows.
                return at ? (
                    <span className="text-sm text-text-primary">{formatDate(at, { seconds: true })}</span>
                ) : (
                    <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>
                );
            },
        },
        {
            header: "Last Auto-Update",
            sortable: true,
            sortValue: (client) => toTimestamp(lastRunAt(client)) ?? 0,
            table: { cellClassName: "whitespace-nowrap" },
            render: (client) => {
                if (client.autoUpdateRunningSince) {
                    return <Badge variant="info">Running</Badge>;
                }
                const at = lastRunAt(client);
                // With seconds, like the Docker State column next to it.
                return at ? (
                    <span className="text-sm text-text-primary">{formatDate(at, { seconds: true })}</span>
                ) : (
                    <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>
                );
            },
        },
        {
            header: "Last Auto-Prune",
            sortable: true,
            sortValue: (client) => toTimestamp(client.autoPruneLastRun ?? null) ?? 0,
            table: { cellClassName: "whitespace-nowrap" },
            render: (client) => {
                if (client.autoPruneRunningSince) {
                    return <Badge variant="info">Running</Badge>;
                }
                // Kept after auto-prune is switched off: it still says when the host last pruned.
                const at = client.autoPruneLastRun;
                return at ? (
                    <span className="text-sm text-text-primary">{formatDate(at, { seconds: true })}</span>
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

    // What the header's buttons act on: the rows the view shows, by the same test.
    const shownClients = useMemo(
        () => (searchQuery ? clients.filter((c) => matchesSearch(c, searchQuery)) : clients),
        [clients, searchQuery],
    );

    return (
        <DataMultiView
            title={
                <>
                    <Monitor size={18} className="text-text-muted" /> Clients
                </>
            }
            extraActions={extraActions?.(shownClients, listScope(searchQuery !== ""))}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: STORAGE_KEYS.clientsView, scope: "local" } }}
            data={sortedClients}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search clients…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No clients match “${searchQuery}”.`}
            emptyMessage={
                <EmptyState
                    icon={Monitor}
                    title="No clients connected"
                    description="A client appears here once its agent has registered with this server."
                />
            }
            rowClassName="align-top"
            onRowClick={setSelectedClient ?? undefined}
            // The view owns the page state and takes the page after sorting, so a column
            // sort covers every client, not just the ones on screen.
            pagination={listPagination(PAGE_SIZE.page)}
        />
    );
};
