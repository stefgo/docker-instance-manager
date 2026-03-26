import { useState } from "react";
import { Layers, RefreshCw, Download } from "lucide-react";
import { DataMultiView, DataTableDef, ActionButton } from "@stefgo/react-ui-components";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";
import { UpdateStatusCell } from "../../docker/imageTypes";
import { useImages2Data } from "../useImages2Data";
import { ImageTreeNode } from "../images2Types";

export const Images2View = () => {
  const { token } = useAuth();
  const { checkImageUpdate, pullImage, imagePullStatus } = useDockerStore();
  const images = useImages2Data();

  const [checkingImages, setCheckingImages] = useState<Record<string, boolean>>({});

  const getImageRef = (node: ImageTreeNode) => `${node.repository}:${node.tag}`;

  const handleCheckUpdate = async (node: ImageTreeNode) => {
    if (!token || node.tag === "<none>" || node.repoDigests.length === 0) return;
    const imageRef = getImageRef(node);
    setCheckingImages((s) => ({ ...s, [imageRef]: true }));
    try {
      await checkImageUpdate(imageRef, node.repoDigests, token);
    } finally {
      setCheckingImages((s) => {
        const n = { ...s };
        delete n[imageRef];
        return n;
      });
    }
  };

  const tableDef: DataTableDef<ImageTreeNode>[] = [
    {
      tableHeader: "Repository:Tag / Image",
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
    {
      tableHeader: "Clients",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-sm text-center",
      sortable: true,
      sortValue: (node) => node.clientIds.length,
      tableItemRender: (node) => <span>{node.clientIds.length}</span>,
    },
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
        const isChecking = !!(checkingImages[imageRef]);
        return (
          <UpdateStatusCell
            imageRef={imageRef}
            updateCheck={node.updateCheck}
            isAnimating={isChecking}
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
        const isChecking = !!(checkingImages[imageRef]);
        const disabled = node.tag === "<none>" || node.repoDigests.length === 0 || isChecking;
        const isPulling = !!(imagePullStatus[imageRef]);
        return (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <ActionButton
              icon={RefreshCw}
              onClick={() => handleCheckUpdate(node)}
              tooltip="Check for Update"
              color="blue"
              disabled={disabled}
              classNames={{ icon: isChecking ? "animate-spin" : "" }}
            />
            <ActionButton
              icon={Download}
              onClick={() => pullImage(imageRef, node.clientIds, token!)}
              tooltip="Pull Image & Container aktualisieren"
              color="green"
              disabled={!node.updateCheck?.hasUpdate || isPulling}
              classNames={{ icon: isPulling ? "animate-spin" : "" }}
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataMultiView<ImageTreeNode>
      title={
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers size={16} className="text-text-muted dark:text-text-muted-dark" />
          Images
        </div>
      }
      viewModeStorageKey="images2ViewMode"
      data={images}
      keyField="id"
      tableDef={tableDef}
      getChildren={(node) => node.nodeType === "repository" ? (node.children ?? null) : null}
      emptyMessage="No images found."
      className="h-full"
    />
  );
};
