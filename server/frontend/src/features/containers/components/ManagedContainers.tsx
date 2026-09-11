import { useMemo, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, RefreshCw, Download, Play, Square, Trash2 } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction, ConfirmDialog } from "@stefgo/react-ui-components";
import { ContainerTreeNode, ContainerInstance, useContainersData } from "../hooks/useContainersData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAutoUpdateStore, ManualAutoUpdateEntry } from "../../../stores/useAutoUpdateStore";

// Module scope, not inside the component: both are pure, and declared in the
// component they were new on every render, which the columns memo depends on.
const STATE_DOT: Record<string, string> = {
    running: "bg-green-500",
    paused: "bg-yellow-400",
    restarting: "bg-blue-400 animate-pulse",
    dead: "bg-red-500",
    created: "bg-purple-400",
};

const getNodeState = (node: ContainerTreeNode): string =>
    node.nodeType === "container" ? node.aggregateState : node.containerState;

export const ManagedContainers = () => {
    const containers = useContainersData();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchQuery = searchParams.get("search") ?? "";
    const { checkImageUpdate, checkingImages, updateImage, imageUpdateStatus, containerAction } = useDockerStore();
    const { enrollMany, unenrollMany } = useAutoUpdateStore();
    const [pendingRemove, setPendingRemove] = useState<ContainerTreeNode | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const filtered = useMemo(() => {
        if (!searchQuery) return containers;
        const q = searchQuery.toLowerCase();
        return containers.filter(
            (r) => r.name.toLowerCase().includes(q) || r.configImage.toLowerCase().includes(q),
        );
    }, [containers, searchQuery]);

    // No explicit return to page 1: a new query changes `data`, and the view resets its page
    // on that by itself.
    const setSearchQuery = (q: string) => setSearchParams(q ? { search: q } : {}, { replace: true });

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const handleCheckUpdate = useCallback((node: ContainerTreeNode) => {
        checkImageUpdate(node.configImage, node.repoDigests);
    }, [checkImageUpdate]);

    const handleCheckAll = useCallback(() => {
        for (const row of containers) {
            checkImageUpdate(row.configImage, row.repoDigests);
        }
    }, [containers, checkImageUpdate]);

    const handleUpdateImage = useCallback((node: ContainerTreeNode) => {
        updateImage(node.configImage, node.clientIds);
    }, [updateImage]);

    const getInstances = (node: ContainerTreeNode): ContainerInstance[] => {
        if (node.nodeType === "container") return node.instances;
        return [{ clientId: node.clientIds[0], containerId: node.containerId, state: node.containerState }];
    };

    const handleContainerStart = useCallback((node: ContainerTreeNode) => {
        const targets = getInstances(node).filter((i) => i.state !== "running" && i.state !== "paused");
        containerAction("container:start", targets);
    }, [containerAction]);

    const handleContainerStop = useCallback((node: ContainerTreeNode) => {
        const targets = getInstances(node).filter((i) => i.state === "running" || i.state === "paused");
        containerAction("container:stop", targets);
    }, [containerAction]);

    // Only asks; confirmRemove below sends the action.
    const handleContainerRemove = useCallback((node: ContainerTreeNode) => {
        setPendingRemove(node);
    }, []);

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setIsRemoving(true);
        try {
            await containerAction("container:remove", getInstances(pendingRemove));
            setPendingRemove(null);
        } finally {
            setIsRemoving(false);
        }
    };

    const handleAutoUpdateToggle = useCallback((node: ContainerTreeNode) => {
        if (node.nodeType === "client") {
            if (node.autoUpdateSource === "label" || node.autoUpdateSource === "global") return;
            const entry: ManualAutoUpdateEntry = { containerName: node.containerName, clientId: node.clientId };
            if (node.autoUpdateSource === "manual") {
                unenrollMany([entry]);
            } else {
                enrollMany([entry]);
            }
            return;
        }
        if (node.hasGlobalEnrollment) {
            unenrollMany([{ containerName: node.name, clientId: "" }]);
            return;
        }
        const togglableChildren = (node.children ?? []).filter(
            (c) => c.autoUpdateSource !== "label",
        );
        if (togglableChildren.length === 0) return;
        const allOn = togglableChildren.every((c) => c.autoUpdateSource === "manual");
        if (allOn) {
            const entries: ManualAutoUpdateEntry[] = togglableChildren.map((c) => ({
                containerName: c.containerName,
                clientId: c.clientId,
            }));
            unenrollMany(entries);
        } else {
            enrollMany([{ containerName: node.name, clientId: "" }]);
        }
    }, [enrollMany, unenrollMany]);

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
                    const dot = STATE_DOT[state] ?? "bg-border";
                    return node.nodeType === "container" ? (
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="text-sm font-medium">{node.name}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="text-sm text-text-muted">{node.clientName}</span>
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
                tableHeader: "Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={node.updateStatus}
                            isChecking={node.repoDigests.length > 0
                                ? node.repoDigests.some((d) => !!checkingImages[d.includes("@") ? d.slice(d.indexOf("@") + 1) : d])
                                : !!checkingImages[node.configImage]}
                            isUpdating={node.clientIds.some((id) => !!imageUpdateStatus[`${id}::${node.configImage}`])}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Auto-Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => {
                    let checked = false;
                    let indeterminate = false;
                    let disabled = false;
                    let title = "";

                    if (node.nodeType === "client") {
                        const src = node.autoUpdateSource;
                        checked = src !== "none";
                        disabled = src === "label" || src === "global";
                        title = src === "label"
                            ? "Auto-update enabled by Docker label (read-only)"
                            : src === "global"
                                ? "Auto-update enabled globally (read-only)"
                                : src === "manual"
                                    ? "Disable Auto-Update"
                                    : "Enable Auto-Update";
                    } else {
                        const allLabelLocked = node.hasLabelChild && !node.hasNonLabelChild && !node.hasGlobalEnrollment;
                        const agg = node.autoUpdateAggregate;
                        disabled = allLabelLocked;
                        checked = agg !== "none";
                        indeterminate = agg === "mixed" && !node.hasGlobalEnrollment;
                        title = allLabelLocked
                            ? "All instances enrolled by Docker label (read-only)"
                            : node.hasGlobalEnrollment
                                ? "All instances enrolled globally"
                                : agg === "all"
                                    ? "All instances enrolled"
                                    : agg === "mixed"
                                        ? "Some instances enrolled"
                                        : "Enable Auto-Update";
                    }

                    return (
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                ref={(el) => { if (el) el.indeterminate = indeterminate; }}
                                onChange={() => handleAutoUpdateToggle(node)}
                                title={title}
                                className="w-4 h-4 cursor-pointer disabled:cursor-default accent-primary"
                            />
                        </div>
                    );
                },
            },
            {
                tableHeader: "Action",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (node: ContainerTreeNode) => {
                    const instances = getInstances(node);
                    const canStart = instances.some((i) => i.state !== "running" && i.state !== "paused");
                    const canStop = instances.some((i) => i.state === "running" || i.state === "paused");
                    const menuEntries = [
                        {
                            label: { enabled: "Start", disabled: "Already running" },
                            icon: Play,
                            onClick: () => handleContainerStart(node),
                            variant: "default" as const,
                            disabled: !canStart,
                        },
                        {
                            label: { enabled: "Stop", disabled: "Already stopped" },
                            icon: Square,
                            onClick: () => handleContainerStop(node),
                            variant: "default" as const,
                            disabled: !canStop,
                        },
                        {
                            label: { enabled: "Remove", disabled: "" },
                            icon: Trash2,
                            onClick: () => handleContainerRemove(node),
                            variant: "danger" as const,
                            disabled: false,
                        },
                    ];
                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction
                                rowId={node.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => handleCheckUpdate(node),
                                        tooltip: { enabled: "Check for Update", disabled: "" },
                                        color: "blue",
                                        disabled: node.repoDigests.length > 0
                                            ? node.repoDigests.some((d) => !!checkingImages[d.includes("@") ? d.slice(d.indexOf("@") + 1) : d])
                                            : !!checkingImages[node.configImage],
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => handleUpdateImage(node),
                                        tooltip: { enabled: "Pull & Recreate", disabled: node.updateStatus !== "update" ? "No update available" : "" },
                                        color: "blue",
                                        disabled: node.updateStatus !== "update" || node.clientIds.some((id) => !!imageUpdateStatus[`${id}::${node.configImage}`]),
                                    },
                                ]}
                                menuEntries={menuEntries}
                            />
                        </div>
                    );
                },
            },
        ],
        [checkingImages, imageUpdateStatus, handleCheckUpdate, handleUpdateImage, handleAutoUpdateToggle, handleContainerStart, handleContainerStop, handleContainerRemove],
    );

    // A container row stands for every instance of that name across clients, and Remove
    // on it removes all of them -- which the title has to say, not just the name.
    const removeTitle = !pendingRemove
        ? ""
        : pendingRemove.nodeType === "client"
            ? `Remove container "${pendingRemove.containerName}" on ${pendingRemove.clientName}?`
            : pendingRemove.instances.length === 1
                ? `Remove container "${pendingRemove.name}"?`
                : `Remove container "${pendingRemove.name}" on all ${pendingRemove.instances.length} clients?`;

    return (
        <>
            <DataMultiView<ContainerTreeNode>
                title={
                    <>
                        <Box size={18} className="text-text-muted" /> Container
                    </>
                }
                extraActions={
                    <button
                        onClick={handleCheckAll}
                        disabled={isAnyChecking}
                        title="Check all for updates"
                        className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
                        Check
                    </button>
                }
                viewMode={{ storageKey: "containersViewMode" }}
                data={filtered}
                keyField="id"
                tableDef={columns}
                getChildren={getChildren}
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                searchable
                searchPlaceholder="Search containers..."
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No containers found."
                pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
                className="h-full"
            />

            {/* The agent removes with force (DockerService), so a running container goes too. */}
            <ConfirmDialog
                isOpen={!!pendingRemove}
                onClose={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
                title={removeTitle}
                description="The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept."
                confirmLabel="Remove container"
                variant="danger"
                isConfirming={isRemoving}
            />
        </>
    );
};
