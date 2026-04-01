import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, CircleHelp, CircleAlert, CircleCheck, RefreshCw, LoaderCircle, Download } from "lucide-react";
import { DataMultiView, DataTableDef, DataAction } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode, RepositoryNode, TagNode, UpdateStatus } from "../hooks/useImagesData";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

function UpdateIcon({ status, isChecking, isUpdating }: { status: UpdateStatus; isChecking?: boolean; isUpdating?: boolean }) {
  if (isUpdating) {
    return <LoaderCircle size={16} className="text-green-500 animate-spin" />;
  }
  if (isChecking) {
    return <LoaderCircle size={16} className="text-primary animate-spin" />;
  }
  switch (status) {
    case "update":
      return <CircleAlert size={16} className="text-yellow-500" />;
    case "unchecked":
      return <CircleHelp size={16} className="text-text-muted dark:text-text-muted-dark" />;
    case "current":
      return <CircleCheck size={16} className="text-green-500" />;
    case "none":
      return <span className="text-text-muted dark:text-text-muted-dark">–</span>;
  }
}

function isNodeChecking(node: ImageTreeNode, checkingImages: Record<string, boolean>): boolean {
  if (node.nodeType === "tag" || node.nodeType === "digest") {
    return !!checkingImages[`${node.repository}:${node.tag}`];
  }
  return node.children?.some((t) => !!checkingImages[`${node.repository}:${t.tag}`]) ?? false;
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

function canCheck(node: ImageTreeNode): boolean {
  return node.repository !== "<none>" &&
    (node.nodeType === "digest" ? node.tag !== "<none>" :
     node.nodeType === "tag" ? node.tag !== "<none>" :
     node.children?.some((t) => t.tag !== "<none>") ?? false);
}

function nodeHasUpdate(node: ImageTreeNode): boolean {
  if (node.updateStatus === "update") return true;
  return false;
}

export const ManagedImages = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { checkImageUpdate, checkingImages, updateImage, imageUpdateStatus } = useDockerStore();
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

  const handleUpdateImage = useCallback((node: ImageTreeNode) => {
    if (!token) return;
    if (node.nodeType === "tag" || node.nodeType === "digest") {
      if (node.repository !== "<none>" && node.tag !== "<none>") {
        updateImage(`${node.repository}:${node.tag}`, node.clientIds, token);
      }
    } else if (node.nodeType === "repository") {
      for (const tag of node.children ?? []) {
        if (tag.tag !== "<none>" && nodeHasUpdate(tag)) {
          updateImage(`${node.repository}:${tag.tag}`, tag.clientIds, token);
        }
      }
    }
  }, [token, updateImage]);

  const handleCheckUpdate = useCallback((node: ImageTreeNode) => {
    if (!token) return;
    if (node.nodeType === "tag" || node.nodeType === "digest") {
      if (node.repository !== "<none>" && node.tag !== "<none>" && node.repoDigests.length > 0) {
        checkImageUpdate(`${node.repository}:${node.tag}`, node.repoDigests, token);
      }
    } else if (node.nodeType === "repository") {
      for (const tag of node.children ?? []) {
        if (tag.tag !== "<none>" && tag.repoDigests.length > 0) {
          checkImageUpdate(`${node.repository}:${tag.tag}`, tag.repoDigests, token);
        }
      }
    }
  }, [token, checkImageUpdate]);

  const columns: DataTableDef<ImageTreeNode>[] = useMemo(() => [
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
      tableItemRender: (node: ImageTreeNode) => {
        const imageRef = node.nodeType === "tag" || node.nodeType === "digest"
          ? `${node.repository}:${node.tag}`
          : null;
        const isUpdating = imageRef ? !!imageUpdateStatus[imageRef] : false;
        return (
          <div className="flex justify-center">
            <UpdateIcon
              status={node.updateStatus}
              isChecking={isNodeChecking(node, checkingImages)}
              isUpdating={isUpdating}
            />
          </div>
        );
      },
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (node: ImageTreeNode) => {
        const imageRef = node.nodeType === "tag" || node.nodeType === "digest"
          ? `${node.repository}:${node.tag}`
          : node.id;
        const isChecking = !!checkingImages[imageRef] ||
          (node.nodeType === "repository" && node.children?.some((t) => !!checkingImages[`${node.repository}:${t.tag}`]));
        const isUpdating = node.nodeType === "repository"
          ? node.children?.some((t) => !!imageUpdateStatus[`${node.repository}:${t.tag}`]) ?? false
          : !!imageUpdateStatus[imageRef];
        const canUpdate =
          node.repository !== "<none>" &&
          (node.nodeType === "repository"
            ? node.children?.some((t) => t.tag !== "<none>") ?? false
            : node.tag !== "<none>") &&
          nodeHasUpdate(node);
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={node.id}
              actions={[
                {
                  icon: RefreshCw,
                  onClick: () => handleCheckUpdate(node),
                  tooltip: "Check for Update",
                  color: "blue",
                  disabled: !canCheck(node) || isChecking,
                },
                {
                  icon: Download,
                  onClick: () => handleUpdateImage(node),
                  tooltip: "Pull & Recreate",
                  color: "green",
                  disabled: !canUpdate || isUpdating,
                },
              ]}
            />
          </div>
        );
      },
    },
  ], [checkingImages, imageUpdateStatus, handleCheckUpdate, handleUpdateImage]);

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
