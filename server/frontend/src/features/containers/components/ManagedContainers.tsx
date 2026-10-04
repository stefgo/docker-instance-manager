import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Box, RefreshCw, Download } from "lucide-react";
import {
    Button,
    DataAction,
    DataMultiView,
    DataTableDef,
    StatusDot,
} from "@stefgo/react-ui-components";
import { ContainerTreeNode } from "../lib/containerGroups";
import { useContainersData } from "../hooks/useContainersData";
import { containerMenuEntries, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { stateDot, containerPath, getNodeState } from "../containerState";
import { hasAutoUpdateSource } from "../autoUpdate";
import { AutoUpdateSourceCell } from "./AutoUpdateSourceCell";
import { ProjectPullButton } from "../../projects/components/ProjectPullButton";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { CheckLabel } from "../../images/components/CheckLabel";

interface ManagedContainersProps {
    /** Limits the list to the containers of one project. */
    projectId?: string;
    searchParamKey?: string;
}

export const ManagedContainers = ({ projectId, searchParamKey }: ManagedContainersProps = {}) => {
    const containers = useContainersData(projectId);
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const navigate = useNavigate();
    const {
        isAnyChecking,
        isChecking,
        isUpdating,
        checkUpdate,
        checkAll,
        pullAndRecreate,
        start,
        stop,
        remove,
    } = useContainerActions();

    const filtered = useMemo(() => {
        if (!searchQuery) return containers;
        const q = searchQuery.toLowerCase();
        return containers.filter(
            (r) => r.name.toLowerCase().includes(q) || r.configImage.toLowerCase().includes(q),
        );
    }, [containers, searchQuery]);

    // No explicit return to page 1: a new query changes `data`, and the view resets its page
    // on that by itself.

    const getChildren = useCallback((node: ContainerTreeNode) => {
        if (node.nodeType === "container") return node.children ?? null;
        return null;
    }, []);

    const columns: DataTableDef<ContainerTreeNode>[] = useMemo(
        () => [
            {
                tableHeader: "Container",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.name : node.clientName,
                tableItemRender: (node: ContainerTreeNode) => {
                    const state = getNodeState(node);
                    const dot = <StatusDot {...stateDot(state)} />;
                    return node.nodeType === "container" ? (
                        <div className="flex items-center gap-2">
                            {dot}
                            <span className="text-sm font-medium">{node.name}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {dot}
                            <span className="text-sm text-text-muted">
                                {node.clientName}
                                {/* The dot is decorative; the text says why it is hollow. */}
                                {!node.clientOnline && " (offline)"}
                            </span>
                        </div>
                    );
                },
            },
            {
                tableHeader: "Image",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.configImage : "",
                tableItemRender: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? (
                        <span className="text-sm font-medium text-text-muted">
                            {node.configImage}
                        </span>
                    ) : null,
            },
            {
                tableHeader: "Clients",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.clientCount : 0,
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? (
                        <span>{node.clientCount}</span>
                    ) : null,
            },
            {
                tableHeader: "Auto-Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => (
                    <div className={`flex ${hasAutoUpdateSource(node.autoUpdate) ? "justify-start" : "justify-center"}`}>
                        <AutoUpdateSourceCell
                            enrollment={node.autoUpdate}
                            hasConflict={node.nodeType === "container" ? node.hasConflict : undefined}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Up-to-date",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={node.updateStatus}
                            isChecking={isChecking(node)}
                            isUpdating={isUpdating(node)}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Actions",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (node: ContainerTreeNode) => {
                    const menuEntries = containerMenuEntries(node, { start, stop, remove });
                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction
                                rowId={node.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => checkUpdate(node),
                                        tooltip: { enabled: "Check for updates", disabled: "Checking…" },
                                        color: "blue",
                                        disabled: isChecking(node),
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => pullAndRecreate(node),
                                        tooltip: {
                                            enabled: "Pull & Recreate",
                                            disabled: isUpdating(node)
                                                ? "Pulling…"
                                                : node.updateStatus !== "update"
                                                    ? "No update available"
                                                    : "Client offline",
                                        },
                                        color: "green",
                                        disabled: node.updateStatus !== "update" || !isReachable(node) || isUpdating(node),
                                    },
                                ]}
                                menuEntries={menuEntries}
                            />
                        </div>
                    );
                },
            },
        ],
        [isChecking, isUpdating, checkUpdate, pullAndRecreate, start, stop, remove],
    );

    return (
        <DataMultiView<ContainerTreeNode>
            title={
                <>
                    <Box size={18} className="text-text-muted" /> Containers
                </>
            }
            extraActions={
                <>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={() => checkAll(containers)}
                        disabled={isAnyChecking}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        <CheckLabel />
                    </Button>
                    {/* A whole project's pull only exists where the list is one project. */}
                    {projectId && <ProjectPullButton projectId={projectId} />}
                </>
            }
            viewMode={{ persist: { key: STORAGE_KEYS.containersView, scope: "local" } }}
            data={filtered}
            keyField="id"
            tableDef={columns}
            getChildren={getChildren}
            // `from` is where the page leads back to: this list may sit in a project's tab.
            onRowClick={(node) => navigate(containerPath(node))}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No containers found."
            // In a project's tab the list shares its page with the project header.
            pagination={pagination(projectId ? PAGE_SIZE.embedded : PAGE_SIZE.page)}
            className="h-full"
        />
    );
};
