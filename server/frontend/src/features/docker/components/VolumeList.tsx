import { useMemo, useState } from "react";
import { DockerVolume, DockerActionType } from "@dim/shared";
import { Trash2, HardDrive } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListDef,
  DataListColumnDef,
  DataAction,
} from "@stefgo/react-ui-components";
import { usePagination } from "../../../hooks/usePagination";
import { formatDate } from "../../../utils";

interface VolumeListProps {
  volumes: DockerVolume[];
  onAction: (action: DockerActionType, target: string) => void;
}

export const VolumeList = ({ volumes, onAction }: VolumeListProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedVolumes = useMemo(
    () => [...volumes].sort((a, b) => a.name.localeCompare(b.name)),
    [volumes],
  );

  const filteredVolumes = useMemo(() => {
    if (!searchQuery) return sortedVolumes;
    const q = searchQuery.toLowerCase();
    return sortedVolumes.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q),
    );
  }, [sortedVolumes, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filteredVolumes, 10);

  const tableDef: DataTableDef<DockerVolume>[] = [
    {
      tableHeader: "Name",
      sortable: true,
      sortValue: (v) => v.name,
      tableCellClassName: "text-sm text-text-primary dark:text-text-primary-dark max-w-[280px] truncate",
      tableItemRender: (v) => <span title={v.name}>{v.name}</span>,
    },
    {
      tableHeader: "Driver",
      sortable: true,
      accessorKey: "driver",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
    },
    {
      tableHeader: "Created",
      sortable: true,
      sortValue: (v) => v.createdAt ?? '',
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (v) => <>{v.createdAt ? formatDate(v.createdAt) : "–"}</>,
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (v) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataAction
            rowId={v.name}
            menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("volume:remove", v.name), variant: "danger" }]}
          />
        </div>
      ),
    },
  ];

  const listColumns: DataListColumnDef<DockerVolume>[] = [
    {
      fields: [
        {
          listLabel: "Name",
          listItemRender: (v) => <span className="text-sm">{v.name}</span>,
        },
        {
          listLabel: "Driver",
          listItemRender: (v) => <span className="text-sm">{v.driver}</span>,
        },
        {
          listLabel: "Created",
          listItemRender: (v) => <span className="text-sm">{v.createdAt ? formatDate(v.createdAt) : "–"}</span>,
        },
      ] satisfies DataListDef<DockerVolume>[],
      columnClassName: "flex-1",
    },
    {
      fields: [
        {
          listLabel: null,
          listItemRender: (v) => (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
              <DataAction
                rowId={v.name}
                menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("volume:remove", v.name), variant: "danger" }]}
              />
            </div>
          ),
        },
      ] satisfies DataListDef<DockerVolume>[],
      columnClassName: "md:text-right",
    },
  ];

  return (
    <DataMultiView
      title={<><HardDrive size={18} className="text-text-muted dark:text-text-muted-dark" /> Volumes</>}
      defaultSort={{ colIndex: 0, direction: 'asc' }}
      viewModeStorageKey="dockerVolumeViewMode"
      data={currentItems}
      tableDef={tableDef}
      listColumns={listColumns}
      keyField="name"
      searchable
      searchPlaceholder="Volume suchen…"
      onSearchChange={setSearchQuery}
      emptyMessage="No Volumes found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
    />
  );
};
