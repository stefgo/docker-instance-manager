import { useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, RefreshCw } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction } from "@stefgo/react-ui-components";
import { ContainerRow, useContainersData } from "../hooks/useContainersData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

export const ManagedContainers = () => {
  const containers = useContainersData();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const setSearchQuery = (q: string) => setSearchParams(q ? { search: q } : {}, { replace: true });
  const { checkImageUpdate, checkingImages } = useDockerStore();
  const { token } = useAuth();

  const filtered = useMemo(() => {
    if (!searchQuery) return containers;
    const q = searchQuery.toLowerCase();
    return containers.filter(
      (r) => r.name.toLowerCase().includes(q) || r.configImage.toLowerCase().includes(q),
    );
  }, [containers, searchQuery]);

  const handleCheckUpdate = useCallback((row: ContainerRow) => {
    if (!token || row.repoDigests.length === 0) return;
    checkImageUpdate(row.configImage, row.repoDigests, token);
  }, [token, checkImageUpdate]);

  const columns: DataTableDef<ContainerRow>[] = useMemo(
    () => [
      {
        tableHeader: "Container",
        sortable: true,
        sortValue: (row: ContainerRow) => row.name,
        tableItemRender: (row: ContainerRow) => (
          <span className="text-sm font-medium">{row.name}</span>
        ),
      },
      {
        tableHeader: "Image",
        sortable: true,
        sortValue: (row: ContainerRow) => row.configImage,
        tableItemRender: (row: ContainerRow) => (
          <span className="text-sm font-medium text-text-muted dark:text-text-muted-dark">
            {row.configImage}
          </span>
        ),
      },
      {
        tableHeader: "Clients",
        sortable: true,
        sortValue: (row: ContainerRow) => row.clientCount,
        tableCellClassName: "text-sm text-center",
        tableHeaderClassName: "text-center",
        tableItemRender: (row: ContainerRow) => (
          <span title={row.clientNames.join(", ")}>{row.clientCount}</span>
        ),
      },
      {
        tableHeader: "Update",
        tableCellClassName: "text-center",
        tableHeaderClassName: "text-center",
        tableItemRender: (row: ContainerRow) => (
          <div className="flex justify-center">
            <UpdateIcon
              status={row.updateStatus}
              isChecking={!!checkingImages[row.configImage]}
            />
          </div>
        ),
      },
      {
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (row: ContainerRow) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={row.id}
              actions={[
                {
                  icon: RefreshCw,
                  onClick: () => handleCheckUpdate(row),
                  tooltip: "Check for Update",
                  color: "blue",
                  disabled: row.repoDigests.length === 0 || !!checkingImages[row.configImage],
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [checkingImages, handleCheckUpdate],
  );

  return (
    <DataMultiView<ContainerRow>
      title={
        <>
          <Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container
        </>
      }
      viewModeStorageKey="containersViewMode"
      data={filtered}
      keyField="id"
      tableDef={columns}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search containers..."
      defaultSearchValue={searchQuery}
      onSearchChange={setSearchQuery}
      emptyMessage="No containers found."
      className="h-full"
    />
  );
};
