import { DockerNetwork, DockerActionType } from "@dim/shared";
import { Trash2, Network } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListDef,
  DataListColumnDef,
  DataAction,
} from "@stefgo/react-ui-components";
import { usePagination } from "../../../hooks/usePagination";

interface NetworkListProps {
  networks: DockerNetwork[];
  onAction: (action: DockerActionType, target: string) => void;
}

const SYSTEM_NETWORKS = new Set(["bridge", "host", "none"]);

export const NetworkList = ({ networks, onAction }: NetworkListProps) => {
  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(networks, 10);

  const tableDef: DataTableDef<DockerNetwork>[] = [
    {
      tableHeader: "Name",
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
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      accessorKey: "driver",
    },
    {
      tableHeader: "Subnet",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (n) => <>{n.ipam.config[0]?.subnet ?? "–"}</>,
    },
    {
      tableHeader: "Scope",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      accessorKey: "scope",
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
      viewModeStorageKey="dockerNetworkViewMode"
      data={currentItems}
      tableDef={tableDef}
      listColumns={listColumns}
      keyField="id"
      emptyMessage="No Networks found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
    />
  );
};
