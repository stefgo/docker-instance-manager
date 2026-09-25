import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useNow } from "../../../hooks/useNow";
import { DockerContainer, DockerActionType } from "@dim/shared";
import { Play, Square, RotateCcw, Trash2, Pause, PlayCircle, Box, RefreshCw, Download } from "lucide-react";
import {
    DataMultiView,
    DataTableDef,
    DataListDef,
    DataListColumnDef,
    DataAction,
    Button,
} from "@stefgo/react-ui-components";
import { StatusDot } from "./StatusDot";
import { shortImageRef } from "../../images/lib/digest";
import { useAutoUpdateStore } from "../../../stores/useAutoUpdateStore";
import { resolveAutoUpdate } from "../../containers/autoUpdate";
import {
    containerKey,
    hostHasSchedule,
    useProjectAssignment,
} from "../../projects/hooks/useProjectMembers";
import { useClientStore } from "../../../stores/useClientStore";
import { AutoUpdateSourceCell } from "../../containers/components/AutoUpdateSourceCell";
import { STATE_DOT, containerStatus } from "../../containers/containerState";
import { ContainerStatus } from "../../containers/components/ContainerStatus";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { ClientNode, useContainersData } from "../../containers/hooks/useContainersData";
import { isReachable, useContainerActions } from "../../containers/hooks/useContainerActions";

interface ClientContainerListProps {
    clientId: string;
    containers: DockerContainer[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ClientContainerList = ({ clientId, containers, onAction, searchParamKey = "search" }: ClientContainerListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const labelFilter = useAutoUpdateStore((s) => s.labelFilter);
    const assignment = useProjectAssignment();
    const hostSchedule = hostHasSchedule(useClientStore((s) => s.clients.find((cl) => cl.id === clientId)));
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const containerGroups = useContainersData();
    const { isAnyChecking, isChecking, isUpdating, checkUpdate, checkAll, pullAndRecreate } = useContainerActions();

    // The instance rows of this host, by container: they carry the update status and are
    // what the update actions take, so the list checks and pulls the way the instance page does.
    const instanceById = useMemo(() => {
        const map = new Map<string, ClientNode>();
        for (const group of containerGroups) {
            for (const child of group.children ?? []) {
                if (child.clientId === clientId) map.set(child.containerId, child);
            }
        }
        return map;
    }, [containerGroups, clientId]);

    const renderUpdateIcon = (c: DockerContainer) => {
        const node = instanceById.get(c.id);
        return (
            <UpdateIcon
                status={node?.updateStatus ?? "none"}
                isChecking={node ? isChecking(node) : false}
                isUpdating={node ? isUpdating(node) : false}
            />
        );
    };

    // A row opens the page of its instance: the container on this host, addressed by name.
    const openInstance = (c: DockerContainer) => {
        const name = c.names[0]?.replace(/^\//, "");
        if (!name) return;
        navigate(
            `/client/${encodeURIComponent(clientId)}/container/${encodeURIComponent(name)}`,
            { state: { from: pathname + search } },
        );
    };

    const enrollmentOf = (c: DockerContainer) =>
        resolveAutoUpdate(c, labelFilter, assignment.get(containerKey(clientId, c.id)), hostSchedule);

    const sortedContainers = useMemo(
        () => [...containers].sort((a, b) => (a.names[0]?.replace(/^\//, "") ?? a.id).localeCompare(b.names[0]?.replace(/^\//, "") ?? b.id)),
        [containers],
    );

    // The search matches the status as shown, so it reads the same clock the cells do.
    const now = useNow();
    const filteredContainers = useMemo(() => {
        if (!searchQuery) return sortedContainers;
        const q = searchQuery.toLowerCase();
        return sortedContainers.filter(c =>
            c.names.some(n => n.replace(/^\//, "").toLowerCase().includes(q)) ||
            c.image.toLowerCase().includes(q) ||
            containerStatus(c, now).toLowerCase().includes(q),
        );
    }, [sortedContainers, searchQuery, now]);

    const buildMenuEntries = (c: DockerContainer) => {
        const entries = [];
        const isRunning = c.state === "running";
        const isPaused = c.state === "paused";

        if (!isRunning && !isPaused) {
            entries.push({ label: "Start", icon: Play, onClick: () => onAction("container:start", c.id), variant: "default" as const });
        }
        if (isRunning) {
            entries.push({ label: "Stop", icon: Square, onClick: () => onAction("container:stop", c.id), variant: "default" as const });
            entries.push({ label: "Pause", icon: Pause, onClick: () => onAction("container:pause", c.id), variant: "default" as const });
            entries.push({ label: "Restart", icon: RotateCcw, onClick: () => onAction("container:restart", c.id), variant: "default" as const });
        }
        if (isPaused) {
            entries.push({ label: "Resume", icon: PlayCircle, onClick: () => onAction("container:unpause", c.id), variant: "default" as const });
        }
        entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("container:remove", c.id), variant: "danger" as const });
        return entries;
    };

    // The update actions sit in the row as buttons, as in the container list across all hosts.
    const buildActions = (c: DockerContainer) => {
        const node = instanceById.get(c.id);
        if (!node) return [];
        const checking = isChecking(node);
        const updating = isUpdating(node);
        return [
            {
                icon: RefreshCw,
                onClick: () => checkUpdate(node),
                tooltip: { enabled: "Check for Update", disabled: "Checking…" },
                color: "blue" as const,
                disabled: checking,
            },
            {
                icon: Download,
                onClick: () => pullAndRecreate(node),
                tooltip: {
                    enabled: "Pull & Recreate",
                    disabled: !isReachable(node) ? "Client offline" : updating ? "Pulling…" : "No update available",
                },
                color: "green" as const,
                disabled: !isReachable(node) || node.updateStatus !== "update" || updating,
            },
        ];
    };

    const tableDef: DataTableDef<DockerContainer>[] = [
        {
            tableHeader: "Name",
            sortable: true,
            sortValue: (c) => c.names[0]?.replace(/^\//, "") ?? c.id,
            tableItemRender: (c) => {
                const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
                return (
                    <div className="flex items-center gap-2">
                        <StatusDot online={c.state === "running"} idleClassName={STATE_DOT[c.state]} />
                        <span className="text-sm">{name}</span>
                    </div>
                );
            },
        },
        {
            tableHeader: "Configured Image",
            sortable: true,
            sortValue: (c) => c.configImage ?? "",
            tableCellClassName: "text-sm max-w-[200px] truncate",
            tableItemRender: (c) => <span>{c.configImage}</span>,
        },
        {
            tableHeader: "Status",
            sortable: true,
            // By state: the text carries a duration that moves on while the list stands.
            sortValue: (c) => c.state,
            tableCellClassName: "text-text-muted text-sm",
            tableItemRender: (c) => <ContainerStatus container={c} />,
        },
        {
            tableHeader: "Auto-Update",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center",
            tableItemRender: (c) => (
                <div className="flex justify-center">
                    <AutoUpdateSourceCell enrollment={enrollmentOf(c)} />
                </div>
            ),
        },
        {
            tableHeader: "Up-to-date",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center",
            tableItemRender: (c) => <div className="flex justify-center">{renderUpdateIcon(c)}</div>,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (c) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={c.id}
                        actions={buildActions(c)}
                        menuEntries={buildMenuEntries(c)}
                    />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<DockerContainer>[] = [
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (c) => {
                        const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
                        return (
                            <div className="flex items-center gap-2 py-1">
                                <StatusDot online={c.state === "running"} idleClassName={STATE_DOT[c.state]} />
                                <span className="font-medium text-text-primary">{name}</span>
                            </div>
                        );
                    },
                },
                {
                    listLabel: "Configured Image",
                    listItemRender: (c) => <span className="text-sm">{c.configImage}</span>,
                },
                {
                    listLabel: "Current Image",
                    listItemRender: (c) => <span className="text-sm" title={c.image}>{shortImageRef(c.image)}</span>,
                },
                {
                    listLabel: "Status",
                    listItemRender: (c) => <span className="text-sm"><ContainerStatus container={c} /></span>,
                },
                {
                    listLabel: "Auto-Update",
                    listItemRender: (c) => <AutoUpdateSourceCell enrollment={enrollmentOf(c)} />,
                },
                {
                    listLabel: "Up-to-date",
                    listItemRender: renderUpdateIcon,
                },
            ],
        },
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (c) => (
                        <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                            <DataAction
                                rowId={c.id}
                                actions={buildActions(c)}
                                menuEntries={buildMenuEntries(c)}
                            />
                        </div>
                    ),
                },
            ] satisfies DataListDef<DockerContainer>[],
            columnClassName: "md:text-right",
        },
    ];

    return (
        <DataMultiView
            title={<><Box size={18} className="text-text-muted" /> Containers</>}
            extraActions={
                <Button
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => checkAll(Array.from(instanceById.values()))}
                    disabled={isAnyChecking}
                    classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                >
                    Check
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: "dockerContainerViewMode", scope: "local" } }}
            data={filteredContainers}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No containers found."
            pagination={pagination(PAGE_SIZE.embedded)}
            onRowClick={openInstance}
        />
    );
};
