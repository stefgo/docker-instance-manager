import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode, RepositoryNode, TagNode } from "../hooks/useImagesData";

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

function matchesQuery(node: ImageTreeNode, q: string): boolean {
  if (node.nodeType === "repository") return node.repository.toLowerCase().includes(q);
  if (node.nodeType === "tag") return node.tag.toLowerCase().includes(q);
  return node.digest.toLowerCase().includes(q);
}

function filterTag(tag: TagNode, q: string): TagNode | null {
  if (tag.tag.toLowerCase().includes(q)) return tag;
  const filteredDigests = (tag.children ?? []).filter((d) => matchesQuery(d, q));
  if (filteredDigests.length > 0) return { ...tag, children: filteredDigests };
  return null;
}

function filterRepo(repo: RepositoryNode, q: string): RepositoryNode | null {
  if (repo.repository.toLowerCase().includes(q)) return repo;
  const filteredTags = (repo.children ?? [])
    .map((tag) => filterTag(tag, q))
    .filter((t): t is TagNode => t !== null);
  if (filteredTags.length > 0) return { ...repo, children: filteredTags };
  return null;
}

export const ManagedImages = () => {
  const navigate = useNavigate();
  const images = useImagesData();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredImages = useMemo(() => {
    if (!searchQuery) return images;
    const q = searchQuery.toLowerCase();
    return images
      .map((repo) => filterRepo(repo, q))
      .filter((r): r is RepositoryNode => r !== null);
  }, [images, searchQuery]);

  const getChildren = useCallback((node: ImageTreeNode) => {
    if (node.nodeType === "repository") return node.children ?? null;
    if (node.nodeType === "tag") return node.children ?? null;
    return null;
  }, []);

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      viewModeStorageKey="imagesViewMode"
      data={filteredImages}
      keyField="id"
      tableDef={columns}
      getChildren={getChildren}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search images..."
      onSearchChange={setSearchQuery}
      onRowClick={(node) => navigate(`/image/${encodeURIComponent(node.id)}`)}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
