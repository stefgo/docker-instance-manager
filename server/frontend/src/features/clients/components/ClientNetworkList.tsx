import { useMemo, useState } from "react";
import { DockerNetwork, DockerActionType } from "@dim/shared";
import { Trash2, Network } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListDef,
  DataListColumnDef,
  DataAction,
} from "@stefgo/react-ui-components";
import { usePagination } from "@stefgo/react-ui-components";

interface ClientNetworkListProps {
  networks: DockerNetwork[];
  onAction: (action: DockerActionType, target: string) => void;
}

const SYSTEM_NETWORKS = new Set(["bridge", "host", "none"]);

export const ClientNetworkList = ({ networks, onAction }: ClientNetworkListProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedNetworks = useMemo(
    () => [...networks].sort((a, b) => a.name.localeCompare(b.name)),
    [networks],
  );

  const filteredNetworks = useMemo(() => {
    if (!searchQuery) return sortedNetworks;
    const q = searchQuery.toLowerCase();
    return sortedNetworks.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.driver.toLowerCase().includes(q),
    );
  }, [sortedNetworks, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filteredNetworks, 10);

  const tableDef: DataTableDef<DockerNetwork>[] = [
    {
      tableHeader: "Name",
      sortable: true,
      sortValue: (n) => n.name,
      tableItemRender: (n) => {
        const isSystem = SYSTEM_NETWORKS.has(n.name);
        return (
          <div className="flex items-center gap-2 text-sm">
            {n.name}
            {isSystem && (
              <span className="text-[10px] bg-hover dark:bg-hover-dark text-text-muted dark:text-text-muted-dark px-1.5 py-0.5 rounded">
                system
              </span>
            )}
          </div>
        );
      },
    },
    {
      tableHeader: "Driver",
      sortable: true,
      accessorKey: "driver",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
    },
    {
      tableHeader: "Subnet",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (n) => <>{n.ipam.config[0]?.subnet ?? "–"}</>,
    },
    {
      tableHeader: "Scope",
      sortable: true,
      accessorKey: "scope",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (n) => {
        if (SYSTEM_NETWORKS.has(n.name)) return null;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={n.id}
              menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("network:remove", n.id), variant: "danger" }]}
            />
          </div>
        );
      },
    },
  ];

  const listColumns: DataListColumnDef<DockerNetwork>[] = [
    {
      fields: [
        {
          listLabel: "Name",
          listItemRender: (n) => {
            const isSystem = SYSTEM_NETWORKS.has(n.name);
            return (
              <div className="flex items-center gap-2 text-sm">
                {n.name}
                {isSystem && (
                  <span className="text-[10px] bg-hover dark:bg-hover-dark text-text-muted dark:text-text-muted-dark px-1.5 py-0.5 rounded">
                    system
                  </span>
                )}
              </div>
            );
          },
        },
        {
          listLabel: "Driver",
          listItemRender: (n) => <span className="text-sm">{n.driver}</span>,
        },
        {
          listLabel: "Subnet",
          listItemRender: (n) => <span className="text-sm">{n.ipam.config[0]?.subnet ?? "–"}</span>,
        },
        {
          listLabel: "Scope",
          listItemRender: (n) => <span className="text-sm">{n.scope}</span>,
        },
      ] satisfies DataListDef<DockerNetwork>[],
      columnClassName: "flex-1",
    },
    {
      fields: [
        {
          listLabel: null,
          listItemRender: (n) => {
            if (SYSTEM_NETWORKS.has(n.name)) return null;
            return (
              <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                <DataAction
                  rowId={n.id}
                  menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("network:remove", n.id), variant: "danger" }]}
                />
              </div>
            );
          },
        },
      ] satisfies DataListDef<DockerNetwork>[],
      columnClassName: "md:text-right",
    },
  ];

  return (
    <DataMultiView
      title={<><Network size={18} className="text-text-muted dark:text-text-muted-dark" /> Networks</>}
      defaultSort={{ colIndex: 0, direction: 'asc' }}
      viewModeStorageKey="dockerNetworkViewMode"
      data={currentItems}
      tableDef={tableDef}
      listColumns={listColumns}
      keyField="id"
      searchable
      searchPlaceholder="Search Networks ..."
      onSearchChange={setSearchQuery}
      emptyMessage="No networks found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
    />
  );
};
