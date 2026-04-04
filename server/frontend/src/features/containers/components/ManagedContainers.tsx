import { useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, RefreshCw, Download } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction, usePagination } from "@stefgo/react-ui-components";
import { ContainerTreeNode, useContainersData } from "../hooks/useContainersData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

export const ManagedContainers = () => {
  const containers = useContainersData();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const { checkImageUpdate, checkingImages, updateImage, imageUpdateStatus } = useDockerStore();
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
    checkImageUpdate(node.configImage, node.clientIds, token);
  }, [token, checkImageUpdate]);

  const handleCheckAll = useCallback(() => {
    for (const row of containers) {
      if (!token) return;
      checkImageUpdate(row.configImage, row.clientIds, token);
    }
  }, [containers, token, checkImageUpdate]);

  const handleUpdateImage = useCallback((node: ContainerTreeNode) => {
    if (!token) return;
    updateImage(node.configImage, node.clientIds, token);
  }, [token, updateImage]);

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
        tableItemRender: (node: ContainerTreeNode) =>
          node.nodeType === "container" ? (
            <span className="text-sm font-medium">{node.name}</span>
          ) : (
            <span className="text-sm text-text-muted dark:text-text-muted-dark">{node.clientName}</span>
          ),
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
              isChecking={!!checkingImages[node.configImage]}
              isUpdating={!!imageUpdateStatus[node.configImage]}
            />
          </div>
        ),
      },
      {
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (node: ContainerTreeNode) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={node.id}
              actions={[
                {
                  icon: RefreshCw,
                  onClick: () => handleCheckUpdate(node),
                  tooltip: "Check for Update",
                  color: "blue",
                  disabled: !!checkingImages[node.configImage],
                },
                {
                  icon: Download,
                  onClick: () => handleUpdateImage(node),
                  tooltip: "Pull & Recreate",
                  color: "green",
                  disabled: node.updateStatus !== "update" || !!imageUpdateStatus[node.configImage],
                },
              ]}
            />
          </div>
        ),
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
