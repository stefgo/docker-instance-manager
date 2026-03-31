import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode } from "../hooks/useImagesData";

const columns: DataTableDef<ImageTreeNode>[] = [
  {
    tableHeader: "Repository / Tag / Image",
    sortable: true,
    sortValue: (node) => {
      if (node.nodeType === "repository") return node.repository;
      if (node.nodeType === "tag") return node.tag;
      return node.digest;
    },
    tableItemRender: (node) => {
      if (node.nodeType === "repository") {
        return <span className="text-sm font-medium">{node.repository}</span>;
      }
      if (node.nodeType === "tag") {
        return <span className="text-sm">{node.tag}</span>;
      }
      return (
        <span className="font-mono text-xs text-text-muted dark:text-text-muted-dark truncate">
          {node.digest}
        </span>
      );
    },
  },
  {
    tableHeader: "Images",
    sortable: true,
    sortValue: (node) => node.imageIds.length,
    tableCellClassName: "text-sm text-center",
    tableHeaderClassName: "text-center",
    tableItemRender: (node) => <span>{node.imageIds.length}</span>,
  },
  {
    tableHeader: "Container",
    sortable: true,
    sortValue: (node) => node.containerIds.length,
    tableCellClassName: "text-sm text-center",
    tableHeaderClassName: "text-center",
    tableItemRender: (node) => (
      <span>{node.containerIds.length > 0 ? node.containerIds.length : "–"}</span>
    ),
  },
];

export const ManagedImages = () => {
  const navigate = useNavigate();
  const images = useImagesData();

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      viewModeStorageKey="imagesViewMode"
      data={images}
      keyField="id"
      tableDef={columns}
      getChildren={(node) => {
        if (node.nodeType === "repository") return node.children ?? null;
        if (node.nodeType === "tag") return node.children ?? null;
        return null;
      }}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search images..."
      searchFilter={(node, query) => {
        const q = query.toLowerCase();
        if (node.repository.toLowerCase().includes(q)) return true;
        if (node.nodeType === "repository") {
          return node.children?.some(
            (tag) =>
              tag.tag.toLowerCase().includes(q) ||
              tag.children?.some((digest) => digest.digest.toLowerCase().includes(q)),
          ) ?? false;
        }
        return false;
      }}
      onRowClick={(node) => navigate(`/image/${encodeURIComponent(node.id)}`)}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
