import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode } from "../hooks/useImagesData";

const columns: DataTableDef<ImageTreeNode>[] = [
  {
    tableHeader: "Repository / Image",
    sortable: true,
    sortValue: (node) =>
      node.nodeType === "repository" ? node.repository : node.digest,
    tableItemRender: (node) =>
      node.nodeType === "repository" ? (
        <span className="font-medium">{node.repository}</span>
      ) : (
        <span className="font-mono text-xs text-text-muted dark:text-text-muted-dark truncate">
          {node.digest}
        </span>
      ),
  },
  {
    tableHeader: "Images",
    sortable: true,
    sortValue: (node) => node.imageIds.length,
    tableCellClassName: "text-center w-24",
    tableHeaderClassName: "text-center w-24",
    tableItemRender: (node) => (
      <span>{node.imageIds.length}</span>
    ),
  },
  {
    tableHeader: "Container",
    sortable: true,
    sortValue: (node) => node.containerIds.length,
    tableCellClassName: "text-center w-24",
    tableHeaderClassName: "text-center w-24",
    tableItemRender: (node) => (
      <span>{node.containerIds.length > 0 ? node.containerIds.length : "–"}</span>
    ),
  },
];

export const ManagedImages = () => {
  const images = useImagesData();

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <span className="flex items-center gap-2">
          <Layers size={18} /> Images
        </span>
      }
      viewModeStorageKey="imagesViewMode"
      data={images}
      keyField="id"
      tableDef={columns}
      getChildren={(node) =>
        node.nodeType === "repository" ? (node.children ?? null) : null
      }
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search images..."
      searchFilter={(node, query) => {
        const q = query.toLowerCase();
        if (node.repository.toLowerCase().includes(q)) return true;
        if (node.nodeType === "digest" && node.digest.toLowerCase().includes(q))
          return true;
        return false;
      }}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
