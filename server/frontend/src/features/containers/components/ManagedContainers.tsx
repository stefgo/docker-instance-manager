import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Box } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { ContainerRow, useContainersData } from "../hooks/useContainersData";

export const ManagedContainers = () => {
  const containers = useContainersData();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const setSearchQuery = (q: string) => setSearchParams(q ? { search: q } : {}, { replace: true });

  const filtered = useMemo(() => {
    if (!searchQuery) return containers;
    const q = searchQuery.toLowerCase();
    return containers.filter(
      (r) => r.name.toLowerCase().includes(q) || r.configImage.toLowerCase().includes(q),
    );
  }, [containers, searchQuery]);

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
    ],
    [],
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
