import { useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, RefreshCw, Download, Play, Square, Trash2 } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction, usePagination } from "@stefgo/react-ui-components";
import { ContainerTreeNode, ContainerInstance, useContainersData } from "../hooks/useContainersData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

export const ManagedContainers = () => {
  const containers = useContainersData();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const { checkImageUpdate, checkingImages, updateImage, imageUpdateStatus, containerAction } = useDockerStore();
  const { token } = useAuth();

  const filtered = useMemo(() => {
    if (!searchQuery) return containers;
    const q = searchQuery.toLowerCase();
    return containers.filter(
      (r) => r.name.toLowerCase().includes(q) || r.configImage.toLowerCase().includes(q),
    );
  }, [containers, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filtered, 20);

  const setSearchQuery = (q: string) => {
    setSearchParams(q ? { search: q } : {}, { replace: true });
    goToPage(1);
  };

  const isAnyChecking = Object.values(checkingImages).some(Boolean);

  const handleCheckUpdate = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    checkImageUpdate(node.configImage, node.repoDigests, token);
  }, [token, checkImageUpdate]);

  const handleCheckAll = useCallback(() => {
    for (const row of containers) {
      if (!token) return;
      checkImageUpdate(row.configImage, row.repoDigests, token);
    }
  }, [containers, token, checkImageUpdate]);

  const handleUpdateImage = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    updateImage(node.configImage, node.clientIds, token);
  }, [token, updateImage]);

  const getInstances = (node: ContainerTreeNode): ContainerInstance[] => {
    if (node.nodeType === "container") return node.instances;
    return [{ clientId: node.clientIds[0], containerId: node.containerId, state: node.containerState }];
  };

  const handleContainerStart = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    const targets = getInstances(node).filter((i) => i.state !== "running" && i.state !== "paused");
    containerAction("container:start", targets, token);
  }, [token, containerAction]);

  const handleContainerStop = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    const targets = getInstances(node).filter((i) => i.state === "running" || i.state === "paused");
    containerAction("container:stop", targets, token);
  }, [token, containerAction]);

  const handleContainerRemove = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    containerAction("container:remove", getInstances(node), token);
  }, [token, containerAction]);

  const getChildren = useCallback((node: ContainerTreeNode) => {
    if (node.nodeType === "container") return node.children ?? null;
    return null;
  }, []);

  const STATE_DOT: Record<string, string> = {
    running: "bg-green-500",
    paused: "bg-yellow-400",
    restarting: "bg-blue-400 animate-pulse",
    dead: "bg-red-500", 
    created: "bg-purple-400",
  };

  const getNodeState = (node: ContainerTreeNode): string =>
    node.nodeType === "container" ? node.aggregateState : node.containerState;

const columns: DataTableDef<ContainerTreeNode>[] = useMemo(
    () => [
      {
        tableHeader: "Container",
        sortable: true,
        sortValue: (node: ContainerTreeNode) =>
          node.nodeType === "container" ? node.name : node.clientName,
        tableItemRender: (node: ContainerTreeNode) => {
          const state = getNodeState(node);
          const dot = STATE_DOT[state] ?? "bg-border dark:bg-border-dark";
          return node.nodeType === "container" ? (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-sm font-medium">{node.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-sm text-text-muted dark:text-text-muted-dark">{node.clientName}</span>
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
            <span className="text-sm font-medium text-text-muted dark:text-text-muted-dark">
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
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (node: ContainerTreeNode) => {
          const instances = getInstances(node);
          const canStart = instances.some((i) => i.state !== "running" && i.state !== "paused");
          const canStop = instances.some((i) => i.state === "running" || i.state === "paused");
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
                  {
                    icon: Play,
                    onClick: () => handleContainerStart(node),
                    tooltip: { enabled: "Start", disabled: "Already running" },
                    color: "green",
                    disabled: !canStart,
                  },
                  {
                    icon: Square,
                    onClick: () => handleContainerStop(node),
                    tooltip: { enabled: "Stop", disabled: "Already stopped" },
                    color: "red",
                    disabled: !canStop,
                  },
                ]}
                menuEntries={[
                  {
                    label: { enabled: "Remove", disabled: "" },
                    icon: Trash2,
                    onClick: () => handleContainerRemove(node),
                    variant: "danger", 
                    disabled: false,
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [checkingImages, imageUpdateStatus, handleCheckUpdate, handleUpdateImage],
  );

  return (
    <DataMultiView<ContainerTreeNode>
      title={
        <>
          <Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container
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
      viewModeStorageKey="containersViewMode"
      data={currentItems}
      keyField="id"
      tableDef={columns}
      getChildren={getChildren}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search containers..."
      defaultSearchValue={searchQuery}
      onSearchChange={setSearchQuery}
      emptyMessage="No containers found."
      pagination={{
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        onPageChange: goToPage,
        onItemsPerPageChange: setItemsPerPage,
      }}
      className="h-full"
    />
  );
};
