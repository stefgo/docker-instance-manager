import { ReactNode, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { ImageTreeNode, RepositoryNode, TagNode } from "../hooks/useImagesData";
import { UpdateIcon } from "./UpdateIcon";

function isNodeChecking(node: ImageTreeNode, checkingImages: Record<string, boolean>): boolean {
  if (node.nodeType === "tag" || node.nodeType === "digest") {
    return !!checkingImages[`${node.repository}:${node.tag}`];
  }
  return node.children?.some((t) => !!checkingImages[`${node.repository}:${t.tag}`]) ?? false;
}

function isNodeUpdating(node: ImageTreeNode, imageUpdateStatus: Record<string, boolean>): boolean {
  if (node.nodeType === "tag" || node.nodeType === "digest") {
    return !!imageUpdateStatus[`${node.repository}:${node.tag}`];
  }
  return node.children?.some((t) => !!imageUpdateStatus[`${node.repository}:${t.tag}`]) ?? false;
}

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

interface ImageRepositoryListProps {
  images: RepositoryNode[];
  extraActions?: ReactNode;
  renderRowActions?: (node: ImageTreeNode) => ReactNode;
  checkingImages: Record<string, boolean>;
  imageUpdateStatus: Record<string, boolean>;
}

export const ImageRepositoryList = ({
  images,
  extraActions,
  renderRowActions,
  checkingImages,
  imageUpdateStatus,
}: ImageRepositoryListProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";
  const setSearchQuery = (q: string) => setSearchParams(q ? { search: q } : {}, { replace: true });

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

  const columns: DataTableDef<ImageTreeNode>[] = useMemo(() => {
    const cols: DataTableDef<ImageTreeNode>[] = [
      {
        tableHeader: "Repository / Tag / Image-Digest",
        sortable: true,
        sortValue: (node: ImageTreeNode) => {
          if (node.nodeType === "repository") return node.repository;
          if (node.nodeType === "tag") return node.tag;
          return node.digest;
        },
        tableItemRender: (node: ImageTreeNode) => {
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
        sortValue: (node: ImageTreeNode) => node.imageIds.length,
        tableCellClassName: "text-sm text-center",
        tableHeaderClassName: "text-center",
        tableItemRender: (node: ImageTreeNode) => <span>{node.imageIds.length}</span>,
      },
      {
        tableHeader: "Container",
        sortable: true,
        sortValue: (node: ImageTreeNode) => node.containerIds.length,
        tableCellClassName: "text-sm text-center",
        tableHeaderClassName: "text-center",
        tableItemRender: (node: ImageTreeNode) => (
          <span>{node.containerIds.length > 0 ? node.containerIds.length : "–"}</span>
        ),
      },
      {
        tableHeader: "Update",
        tableCellClassName: "text-center",
        tableHeaderClassName: "text-center",
        tableItemRender: (node: ImageTreeNode) => (
          <div className="flex justify-center">
            <UpdateIcon
              status={node.updateStatus}
              isChecking={isNodeChecking(node, checkingImages)}
              isUpdating={isNodeUpdating(node, imageUpdateStatus)}
            />
          </div>
        ),
      },
    ];

    if (renderRowActions) {
      cols.push({
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (node: ImageTreeNode) => (
          <div onClick={(e) => e.stopPropagation()}>
            {renderRowActions(node)}
          </div>
        ),
      });
    }

    return cols;
  }, [checkingImages, imageUpdateStatus, renderRowActions]);

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      extraActions={extraActions}
      viewModeStorageKey="imagesViewMode"
      data={filteredImages}
      keyField="id"
      tableDef={columns}
      getChildren={getChildren}
      defaultSort={{ colIndex: 0, direction: "asc" }}
      searchable
      searchPlaceholder="Search images..."
      defaultSearchValue={searchQuery}
      onSearchChange={setSearchQuery}
      onRowClick={(node) => navigate(`/image/${encodeURIComponent(node.id)}`)}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
