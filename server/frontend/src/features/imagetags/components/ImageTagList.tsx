import { useState, useMemo } from "react";
import { Layers, RefreshCw, Download, Scissors, Trash2 } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction } from "@stefgo/react-ui-components";
import { usePagination } from "../../../hooks/usePagination";
import { ImageTreeNode } from "../hooks/useImageTagsData";
import { UpdateStatusCell } from "../../docker/components/UpdateStatusCell";

interface Images2ViewProps {
  images: ImageTreeNode[];
  onCheckUpdate: (node: ImageTreeNode) => Promise<void>;
  onPullAndRecreate: (imageRef: string, clientIds: string[]) => void;
  onRemoveImage: (imageRef: string, clientIds: string[]) => void;
  onPrune: () => Promise<void>;
  onRowClick?: (node: ImageTreeNode) => void;
  showClientsColumn?: boolean;
  checkingImages: Record<string, boolean>;
  imagePullStatus: Record<string, boolean>;
}

export const ImageList = ({
  images,
  onCheckUpdate,
  onPullAndRecreate,
  onRemoveImage,
  onPrune,
  onRowClick,
  showClientsColumn = true,
  checkingImages,
  imagePullStatus,
}: Images2ViewProps) => {
  const [isReloading, setIsReloading] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const handleReload = async () => {
    setIsReloading(true);
    try {
      await Promise.all(images.filter((n) => n.nodeType === "repository").map((n) => onCheckUpdate(n)));
    } finally {
      setIsReloading(false);
    }
  };

  const handlePrune = async () => {
    setIsPruning(true);
    try {
      await onPrune();
    } finally {
      setIsPruning(false);
    }
  };

  const sortedImages = useMemo(
    () => [...images].sort((a, b) => `${a.repository}:${a.tag}`.localeCompare(`${b.repository}:${b.tag}`)) as ImageTreeNode[],
    [images],
  );

  const filteredImages = useMemo((): ImageTreeNode[] => {
    if (!searchQuery) return sortedImages;
    const q = searchQuery.toLowerCase();
    return sortedImages.filter(n =>
      `${n.repository}:${n.tag}`.toLowerCase().includes(q),
    );
  }, [sortedImages, searchQuery]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(filteredImages, 20);

  const getImageRef = (node: ImageTreeNode) => `${node.repository}:${node.tag}`;

  const buildTableDefinitions = (): DataTableDef<ImageTreeNode>[] => [
    {
      tableHeader: "Repository:Tag / Digest",
      sortable: true,
      sortValue: (node) => node.nodeType === "repository" ? `${node.repository}:${node.tag}` : (node.digest ?? ""),
      tableItemRender: (node) =>
        node.nodeType === "repository" ? (
          <span className="text-sm font-medium">
            {node.repository}:{node.tag || "–"}
          </span>
        ) : (
          <code className="text-xs font-mono text-text-muted dark:text-text-muted-dark">
            {node.digest}
          </code>
        ),
    },
    {
      tableHeader: "Images",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      sortable: true,
      sortValue: (node) => node.nodeType === "repository" ? node.imageCount : -1,
      tableItemRender: (node) => (
        <span>{node.nodeType === "repository" ? node.imageCount : "1"}</span>
      ),
    },
    ...(showClientsColumn ? [{
      tableHeader: "Clients",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      sortable: true,
      sortValue: (node: ImageTreeNode) => node.clientIds.length,
      tableItemRender: (node: ImageTreeNode) => <span>{node.clientIds.length}</span>,
    }] : []),
    {
      tableHeader: "Container",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      sortable: true,
      sortValue: (node) => node.containerCount,
      tableItemRender: (node) => <span>{node.containerCount}</span>,
    },
    {
      tableHeader: "Update",
      tableCellClassName: "text-sm",
      tableItemRender: (node) => {
        const imageRef = getImageRef(node);
        return (
          <UpdateStatusCell
            imageRef={imageRef}
            updateCheck={node.updateCheck}
            isAnimating={checkingImages[imageRef] || imagePullStatus[imageRef]}
          />
        );
      },
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (node) => {
        if (node.nodeType === "image") return null;
        const imageRef = getImageRef(node);
        const disabled = node.tag === "<none>" || node.repoDigests.length === 0;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={imageRef}
              actions={[{
                icon: RefreshCw,
                onClick: () => onCheckUpdate(node),
                tooltip: "Check for Update",
                color: "blue",
                disabled: disabled || !!checkingImages[imageRef],
              }]}
              menuEntries={[{
                icon: Download,
                label: "Pull & Recreate",
                onClick: () => onPullAndRecreate(imageRef, node.clientIds),
                disabled: !node.updateCheck?.hasUpdate || !!imagePullStatus[imageRef],
              }, {
                icon: Trash2,
                label: "Remove",
                onClick: () => onRemoveImage(imageRef, node.clientIds),
                variant: "danger",
              }]}
            />
          </div>
        );
      },
    },
  ];

  const tableColumns = buildTableDefinitions();
  
  return (
    <DataMultiView<ImageTreeNode>
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      extraActions={
        <>
          <button
            onClick={handleReload}
            disabled={isReloading}
            title="Check all images for updates"
            className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover"
          >
            <RefreshCw size={16} className={isReloading ? "inline mr-1 animate-spin" : "inline mr-1"} />
            Refresh
          </button>
          <button
            onClick={handlePrune}
            disabled={isPruning}
            title="Remove unused images"
            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
          >
            <Scissors size={16} className="inline mr-1"/>
            Prune
          </button>
        </>
      }
      defaultSort={{ colIndex: 0, direction: 'asc' }}
      viewModeStorageKey="images2ViewMode"
      data={currentItems}
      keyField="id"
      tableDef={tableColumns}
      getChildren={(node) => node.nodeType === "repository" ? (node.children ?? null) : null}
      onRowClick={onRowClick}
      searchable
      searchPlaceholder="Search Images ..."
      onSearchChange={setSearchQuery}
      emptyMessage="No images found."
      pagination={{ currentPage, totalPages, itemsPerPage, totalItems, onPageChange: goToPage, onItemsPerPageChange: setItemsPerPage }}
      className="h-full"
    />
  );
};
