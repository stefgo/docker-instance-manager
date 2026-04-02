import { useState, useMemo } from "react";
import { DockerImage, DockerActionType } from "@dim/shared";
import { Trash2, Download, Layers } from "lucide-react";
import {
  DataMultiView,
  DataTableDef,
  DataListDef,
  DataListColumnDef,
  DataAction,
} from "@stefgo/react-ui-components";
import { usePagination } from "@stefgo/react-ui-components";

interface ClientImageListProps {
  images: DockerImage[];
  onAction: (action: DockerActionType, target: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const ClientImageList = ({ images, onAction }: ClientImageListProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredImages = useMemo((): DockerImage[] => {
    if (!searchQuery) return images;
    const q = searchQuery.toLowerCase();
    return images.filter(img =>
      img.repoTags.some(t => t.toLowerCase().includes(q)) ||
      img.id.replace('sha256:', '').toLowerCase().includes(q),
    );
  }, [images, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filteredImages, 10);

  const buildMenuEntries = (img: DockerImage) => {
    const entries = [];
    if (img.repoTags[0]) {
      entries.push({ label: "Pull", icon: Download, onClick: () => onAction("image:pull", img.repoTags[0]), variant: "default" as const });
    }
    entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("image:remove", img.id), variant: "danger" as const });
    return entries;
  };

  const tableDef: DataTableDef<DockerImage>[] = [
    {
      tableHeader: "Repository / Tag",
      tableCellClassName: "text-sm text-text-primary dark:text-text-primary-dark",
      tableItemRender: (img) => <>{img.repoTags[0] ?? "<none>:<none>"}</>,
      sortable: true,
      sortValue: (img) => img.repoTags[0] ?? "",
    },
    {
      tableHeader: "ID",
      tableCellClassName: "font-mono text-xs text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => <>{img.id.replace("sha256:", "")}</>,
      sortable: true,
      sortValue: (img) => img.id,
    },
    {
      tableHeader: "Size",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => <>{formatBytes(img.size)}</>,
      sortable: true,
      sortValue: (img) => img.size,
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (img) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataAction rowId={img.id} menuEntries={buildMenuEntries(img)} />
        </div>
      ),
    },
  ];

  const listColumns: DataListColumnDef<DockerImage>[] = [
    {
      fields: [
        {
          listLabel: "Tag",
          listItemRender: (img) => (
            <span className="text-sm text-text-primary dark:text-text-primary-dark">
              {img.repoTags[0] ?? "<none>:<none>"}
            </span>
          ),
        },
        {
          listLabel: "ID",
          listItemRender: (img) => (
            <span className="text-sm">{img.id.replace("sha256:", "")}</span>
          ),
        },
        {
          listLabel: "Size",
          listItemRender: (img) => <span className="text-sm">{formatBytes(img.size)}</span>,
        },
      ] satisfies DataListDef<DockerImage>[],
      columnClassName: "flex-1",
    },
    {
      fields: [
        {
          listLabel: null,
          listItemRender: (img) => (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
              <DataAction rowId={img.id} menuEntries={buildMenuEntries(img)} />
            </div>
          ),
        },
      ] satisfies DataListDef<DockerImage>[],
      columnClassName: "md:text-right",
    },
  ];

  return (
    <DataMultiView
      title={<><Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images</>}
      viewModeStorageKey="dockerImageViewMode"
      data={currentItems}
      tableDef={tableDef}
      listColumns={listColumns}
      keyField="id"
      searchable
      searchPlaceholder="Search Images ..."
      onSearchChange={setSearchQuery}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      emptyMessage="No images found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
    />
  );
};
