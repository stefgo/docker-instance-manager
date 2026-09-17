import { useCallback, useMemo, useState } from "react";
import { Monitor, Play, Square, Trash2 } from "lucide-react";
import { CLIENT_STATUS, DockerContainer } from "@dim/shared";
import {
    ConfirmDialog,
    DataAction,
    DataMultiView,
    DataTableDef,
} from "@stefgo/react-ui-components";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAutoUpdateStore } from "../../../stores/useAutoUpdateStore";
import { AutoUpdateEnrollment, resolveAutoUpdate } from "../../containers/autoUpdate";
import { AutoUpdateSourceCell } from "../../containers/components/AutoUpdateSourceCell";
import { StatusDot } from "../../clients/components/StatusDot";
import {
    containerKey,
    hostHasSchedule,
    useAllProjectMembers,
    useProjectAssignment,
    EMPTY_MEMBERS,
} from "../hooks/useProjectMembers";

// Module scope, not inside the component: the same table the fleet-wide container list
// draws its dots from, so a stopped container looks the same on both pages.
// `running` is not in here: StatusDot draws the live state itself.
const STATE_DOT: Record<string, string> = {
    paused: "bg-warning",
    restarting: "bg-info animate-pulse",
    dead: "bg-error",
    created: "bg-accent",
};

interface HostRow {
    id: string;
    nodeType: "host";
    clientId: string;
    clientName: string;
    online: boolean;
    containerCount: number;
    children: ContainerRow[];
}

interface ContainerRow {
    id: string;
    nodeType: "container";
    clientId: string;
    containerId: string;
    name: string;
    image: string;
    state: string;
    status: string;
    autoUpdate: AutoUpdateEnrollment;
}

type Row = HostRow | ContainerRow;

const containerName = (c: DockerContainer): string =>
    c.names[0]?.replace(/^\//, "") ?? c.id;

interface ProjectClientsProps {
    projectId: string;
    searchParamKey?: string;
}

/**
 * The hosts a project runs on, each with the containers of this project on it.
 *
 * The other two tabs group by container and by image, which is what a project is *updated*
 * by; this one groups by host, which is where it actually runs. The rows come from the same
 * membership the header counts, so a container that starts or stops matching the query
 * moves between hosts here without anything being fetched again.
 */
export const ProjectClients = ({ projectId, searchParamKey = "search.clients" }: ProjectClientsProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const clients = useClientStore((s) => s.clients);
    const containerAction = useDockerStore((s) => s.containerAction);
    const labelFilter = useAutoUpdateStore((s) => s.labelFilter);
    const assignment = useProjectAssignment();
    const members = useAllProjectMembers();
    const [pendingRemove, setPendingRemove] = useState<ContainerRow | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const live = members.get(projectId) ?? EMPTY_MEMBERS;

    const rows: HostRow[] = useMemo(() => {
        const clientById = new Map(clients.map((c) => [c.id, c]));
        return live.perClient
            .map(({ clientId, containers }) => {
                const client = clientById.get(clientId);
                const hostSchedule = hostHasSchedule(client);
                const children: ContainerRow[] = containers
                    .map((c) => ({
                        id: `${clientId}/${c.id}`,
                        nodeType: "container" as const,
                        clientId,
                        containerId: c.id,
                        name: containerName(c),
                        image: c.configImage ?? c.image,
                        state: c.state,
                        status: c.status,
                        autoUpdate: resolveAutoUpdate(
                            c,
                            labelFilter,
                            assignment.get(containerKey(clientId, c.id)),
                            hostSchedule,
                        ),
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                return {
                    id: clientId,
                    nodeType: "host" as const,
                    clientId,
                    clientName: client?.displayName ?? client?.hostname ?? clientId,
                    online: client?.status === CLIENT_STATUS.ONLINE,
                    containerCount: children.length,
                    children,
                };
            })
            .sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [live, clients, labelFilter, assignment]);

    // A host stays in the list while one of its containers matches, so a search for a
    // container name still shows the host it runs on.
    const filtered = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows
            .map((host) => {
                if (host.clientName.toLowerCase().includes(q)) return host;
                const children = host.children.filter(
                    (c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
                );
                return children.length > 0 ? { ...host, children } : null;
            })
            .filter((host): host is HostRow => host !== null);
    }, [rows, searchQuery]);

    const getChildren = useCallback(
        (row: Row) => (row.nodeType === "host" ? row.children : null),
        [],
    );

    const start = useCallback(
        (row: ContainerRow) =>
            containerAction("container:start", [{ clientId: row.clientId, containerId: row.containerId }]),
        [containerAction],
    );

    const stop = useCallback(
        (row: ContainerRow) =>
            containerAction("container:stop", [{ clientId: row.clientId, containerId: row.containerId }]),
        [containerAction],
    );

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setIsRemoving(true);
        try {
            await containerAction("container:remove", [
                { clientId: pendingRemove.clientId, containerId: pendingRemove.containerId },
            ]);
            setPendingRemove(null);
        } finally {
            setIsRemoving(false);
        }
    };

    const columns: DataTableDef<Row>[] = useMemo(
        () => [
            {
                tableHeader: "Client / Container",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "host" ? row.clientName : row.name),
                tableItemRender: (row: Row) =>
                    row.nodeType === "host" ? (
                        <div className="flex items-center gap-2">
                            <StatusDot online={row.online} />
                            <span className="text-sm font-medium">{row.clientName}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <StatusDot
                                online={row.state === "running"}
                                idleClassName={STATE_DOT[row.state]}
                            />
                            <span className="text-sm text-text-muted">{row.name}</span>
                        </div>
                    ),
            },
            {
                tableHeader: "Image",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "container" ? row.image : ""),
                tableItemRender: (row: Row) =>
                    row.nodeType === "container" ? (
                        <span className="text-sm text-text-muted">{row.image}</span>
                    ) : null,
            },
            {
                tableHeader: "Status",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "container" ? row.status : ""),
                tableItemRender: (row: Row) =>
                    row.nodeType === "host" ? (
                        <span className="text-sm text-text-muted">
                            {row.containerCount} container(s)
                        </span>
                    ) : (
                        <span className="text-sm text-text-muted">{row.status}</span>
                    ),
            },
            {
                tableHeader: "Auto-Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (row: Row) =>
                    row.nodeType === "container" ? (
                        <div className="flex justify-center">
                            <AutoUpdateSourceCell enrollment={row.autoUpdate} />
                        </div>
                    ) : null,
            },
            {
                tableHeader: "Actions",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (row: Row) => {
                    if (row.nodeType !== "container") return null;
                    const isRunning = row.state === "running" || row.state === "paused";
                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction
                                rowId={row.id}
                                menuEntries={[
                                    {
                                        label: { enabled: "Start", disabled: "Already running" },
                                        icon: Play,
                                        onClick: () => start(row),
                                        variant: "default" as const,
                                        disabled: isRunning,
                                    },
                                    {
                                        label: { enabled: "Stop", disabled: "Already stopped" },
                                        icon: Square,
                                        onClick: () => stop(row),
                                        variant: "default" as const,
                                        disabled: !isRunning,
                                    },
                                    {
                                        label: { enabled: "Remove", disabled: "" },
                                        icon: Trash2,
                                        onClick: () => setPendingRemove(row),
                                        variant: "danger" as const,
                                        disabled: false,
                                    },
                                ]}
                            />
                        </div>
                    );
                },
            },
        ],
        [start, stop],
    );

    return (
        <>
            <DataMultiView<Row>
                title={
                    <>
                        <Monitor size={18} className="text-text-muted" /> Clients
                    </>
                }
                data={filtered}
                keyField="id"
                // `tableDef` plus `getChildren` is what puts the view into its tree mode --
                // the hierarchy is the point of this tab, so no view toggle is offered.
                tableDef={columns}
                getChildren={getChildren}
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                searchable
                searchPlaceholder="Search clients and containers..."
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No containers of this project are running on any client."
                pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
                className="h-full"
            />

            {/* The agent removes with force (DockerService), so a running container goes too. */}
            <ConfirmDialog
                isOpen={!!pendingRemove}
                onClose={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
                title={
                    pendingRemove
                        ? `Remove container "${pendingRemove.name}" on ${
                              rows.find((h) => h.clientId === pendingRemove.clientId)?.clientName ??
                              pendingRemove.clientId
                          }?`
                        : ""
                }
                description="The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept."
                confirmLabel="Remove container"
                variant="danger"
                isConfirming={isRemoving}
            />
        </>
    );
};
