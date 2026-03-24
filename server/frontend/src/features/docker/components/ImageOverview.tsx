import { useMemo, useEffect, useState, useCallback } from "react";
import { Layers, RefreshCw, Download, CheckCircle2, AlertCircle, HelpCircle, Loader2, Trash2, Scissors } from "lucide-react";
import { DockerContainer, DockerImageUpdateCheck } from "@dim/shared";
import { DataMultiView, DataTableDef, DataListDef, DataListColumnDef, ActionButton, DataAction } from "@stefgo/react-ui-components";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import { useAuth } from "../../auth/AuthContext";
import { usePagination } from "../../../hooks/usePagination";

interface ClientUsage {
  clientId: string;
  clientName: string;
  containers: DockerContainer[];
}

interface AggregatedImage {
  id: string;
  name: string;
  repoTags: string[];
  repoDigests: string[];
  size: number;
  clientUsages: ClientUsage[];
  updateCheck?: DockerImageUpdateCheck;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UpdateStatusCell({ imageRef, updateCheck }: { imageRef: string; updateCheck?: DockerImageUpdateCheck }) {
  const { imageUpdateResults } = useDockerStore();
  const isLoading = imageUpdateResults[imageRef] === "loading";

  if (isLoading) {
    return <Loader2 size={14} className="animate-spin text-text-muted dark:text-text-muted-dark" />;
  }

  if (!updateCheck) {
    return <span className="text-xs text-text-muted dark:text-text-muted-dark">–</span>;
  }

  if (updateCheck.error && !updateCheck.hasUpdate) {
    return (
      <span title={updateCheck.error} className="flex items-center gap-1 text-xs text-text-muted dark:text-text-muted-dark">
        <HelpCircle size={14} />
      </span>
    );
  }

  if (updateCheck.hasUpdate) {
    return (
      <span title={`Update available\n${updateCheck.remoteDigest?.slice(0, 19)}`} className="flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400 font-medium">
        <AlertCircle size={14} />
      </span>
    );
  }

  return (
    <span title={`Current (checked: ${new Date(updateCheck.checkedAt).toLocaleString()})`} className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
      <CheckCircle2 size={14} />
    </span>
  );
}

export const ImageOverview = () => {
  const { token } = useAuth();
  const { clients, fetchClients } = useClientStore();
  const { dockerStates, fetchDockerState, checkImageUpdate, imagePullStatus, pullImage, imageUpdateResults } = useDockerStore();

  const handleCheckUpdate = (img: AggregatedImage) => {
    if (!token || !img.repoTags[0] || img.repoTags[0] === "<none>") return;
    checkImageUpdate(img.repoTags[0], img.repoDigests, token);
  };

  const handlePullImage = (img: AggregatedImage) => {
    if (!token || !img.repoTags[0] || img.repoTags[0] === "<none>") return;
    pullImage(img.repoTags[0], img.clientUsages.map((u) => u.clientId), token);
  };

  const handleDeleteImage = async (img: AggregatedImage) => {
    if (!token) return;
    await Promise.all(
      img.clientUsages.map((u) =>
        fetch(`/api/v1/clients/${u.clientId}/docker/action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "image:remove", target: img.id }),
        }),
      ),
    );
  };

  const isImageInUse = (img: AggregatedImage) =>
    img.clientUsages.some((u) => u.containers.length > 0);

  const buildDeleteMenuEntries = (img: AggregatedImage) => {
    const inUse = isImageInUse(img);
    return [{ label: "Remove", icon: Trash2, onClick: () => handleDeleteImage(img), variant: "danger" as const, disabled: inUse, disabledTitle: "Image is used by a container" }];
  };

  const [isPruning, setIsPruning] = useState(false);
  const handlePrune = useCallback(async () => {
    if (!token || isPruning) return;
    setIsPruning(true);
    try {
      const onlineClients = clients.filter((c) => c.status === "online");
      await Promise.all(
        onlineClients.map((c) =>
          fetch(`/api/v1/clients/${c.id}/docker/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "image:prune" }),
          }),
        ),
      );
      await Promise.all(onlineClients.map((c) => fetchDockerState(c.id, token)));
    } finally {
      setIsPruning(false);
    }
  }, [token, isPruning, clients, fetchDockerState]);

  const [isReloading, setIsReloading] = useState(false);
  const handleReload = useCallback(async () => {
    if (!token || isReloading) return;
    setIsReloading(true);
    try {
      await fetchClients(token);
      const onlineClients = clients.filter((c) => c.status === "online");
      await Promise.all(onlineClients.map((c) => fetchDockerState(c.id, token)));

      // Check updates for all unique images across online clients
      const { dockerStates: freshStates } = useDockerStore.getState();
      const checkedTags = new Set<string>();
      for (const client of onlineClients) {
        const state = freshStates[client.id];
        if (!state) continue;
        for (const image of state.images) {
          const tag = image.repoTags[0];
          if (tag && tag !== "<none>" && !checkedTags.has(tag)) {
            checkedTags.add(tag);
            checkImageUpdate(tag, image.repoDigests, token);
          }
        }
      }
    } finally {
      setIsReloading(false);
    }
  }, [token, isReloading, clients, fetchClients, fetchDockerState, checkImageUpdate]);

  useEffect(() => {
    if (token) {
      clients.forEach((c) => fetchDockerState(c.id, token));
    }
  }, [token, clients, fetchDockerState]);

  const aggregatedImages = useMemo(() => {
    const imageMap = new Map<string, AggregatedImage>();

    for (const client of clients) {
      const dockerState = dockerStates[client.id];
      if (!dockerState) continue;

      const clientName = client.displayName || client.hostname;

      for (const image of dockerState.images) {
        if (!imageMap.has(image.id)) {
          imageMap.set(image.id, {
            id: image.id,
            name: image.repoTags[0] ?? image.repoDigests[0]?.split("@")[0] ?? "<none>",
            repoTags: image.repoTags,
            repoDigests: image.repoDigests,
            size: image.size,
            clientUsages: [],
            updateCheck: image.updateCheck,
          });
        }

        const entry = imageMap.get(image.id)!;
        const containers = dockerState.containers.filter(
          (c) => c.imageId === image.id || image.repoTags.includes(c.image)
        );

        entry.clientUsages.push({ clientId: client.id, clientName, containers });
      }
    }

    return Array.from(imageMap.values()).sort((a, b) => b.size - a.size);
  }, [clients, dockerStates]);

  const { currentItems, currentPage, totalPages, itemsPerPage, totalItems, goToPage, setItemsPerPage } =
    usePagination(aggregatedImages, 20);

  const buildTableDefinitions = (): DataTableDef<AggregatedImage>[] => {
    const cols: DataTableDef<AggregatedImage>[] = [];

    cols.push({
      tableHeader: "Repository",
      tableItemRender: (img) => {
        const colonIdx = img.name.lastIndexOf(":");
        const repo = colonIdx !== -1 ? img.name.slice(0, colonIdx) : img.name;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{repo}</span>
            {img.repoTags.length > 1 && (
              <span className="text-xs text-text-muted dark:text-text-muted-dark">
                +{img.repoTags.length - 1} weiterer Tag{img.repoTags.length > 2 ? "s" : ""}
              </span>
            )}
          </div>
        );
      },
    });

    cols.push({
      tableHeader: "Tag",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => {
        const colonIdx = img.name.lastIndexOf(":");
        const tag = colonIdx !== -1 ? img.name.slice(colonIdx + 1) : "";
        return <span>{tag || "–"}</span>;
      },
    });

    cols.push({
      tableHeader: "Clients",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => <span>{img.clientUsages.length}</span>,
    });

    cols.push({
      tableHeader: "Container",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => (
        <span>{img.clientUsages.reduce((sum, u) => sum + u.containers.length, 0)}</span>
      ),
    });

    cols.push({
      tableHeader: "Update",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => (
        <UpdateStatusCell imageRef={img.repoTags[0] ?? ""} updateCheck={img.updateCheck} />
      ),
    });

    cols.push({
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (img) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <ActionButton
            icon={RefreshCw}
            onClick={() => handleCheckUpdate(img)}
            tooltip="Check for Updates"
            color="blue"
            disabled={!img.updateCheck || !img.repoTags[0] || img.repoTags[0] === "<none>"}
          />
          <ActionButton
            icon={Download}
            onClick={() => handlePullImage(img)}
            tooltip="Update Image and Container"
            color="green"
            disabled={!img.updateCheck?.hasUpdate || !!imagePullStatus[img.repoTags[0] ?? ""]}
          />
          <DataAction rowId={img.id} menuEntries={buildDeleteMenuEntries(img)} />
        </div>
      ),
    });

    return cols;
  };

  const buildListDefinitions = (): DataListColumnDef<AggregatedImage>[] => {
    const contentFields: DataListDef<AggregatedImage>[] = [];
    const actionFields: DataListDef<AggregatedImage>[] = [];

    contentFields.push({
      listItemRender: (img) => {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{img.name}</span>
            {img.repoTags.length > 1 && (
              <span className="text-xs text-text-muted dark:text-text-muted-dark">
                +{img.repoTags.length - 1} weiterer Tag{img.repoTags.length > 2 ? "s" : ""}
              </span>
            )}
          </div>
        );
      },
      listLabel: null,
    });

    contentFields.push({
      listLabel: "Hash",
      listItemRender: (img) => (
        <span className="text-sm text-text-muted dark:text-text-muted-dark" title={img.id}>
          {img.id.replace("sha256:", "").slice(0, 12)}
        </span>
      ),
    });

    contentFields.push({
      listLabel: "Size",
      listItemRender: (img) => (
        <span className="text-sm text-text-muted dark:text-text-muted-dark">{formatBytes(img.size)}</span>
      ),
    });

    contentFields.push({
      listLabel: "Clients",
      listItemRender: (img) => <span className="text-sm">{img.clientUsages.length}</span>,
    });

    contentFields.push({
      listLabel: "Container",
      listItemRender: (img) => (
        <span className="text-sm">
          {img.clientUsages.reduce((sum, u) => sum + u.containers.length, 0)}
        </span>
      ),
    });

    contentFields.push({
      listLabel: "Update",
      listItemRender: (img) => {
        const isLoading = imageUpdateResults[img.repoTags[0] ?? ""] === "loading";
        if (isLoading) return <span className="text-sm text-text-muted dark:text-text-muted-dark">Checking…</span>;
        if (!img.updateCheck) return <span className="text-sm text-text-muted dark:text-text-muted-dark">–</span>;
        if (img.updateCheck.error && !img.updateCheck.hasUpdate) return <span className="text-sm text-text-muted dark:text-text-muted-dark" title={img.updateCheck.error}>Unknown</span>;
        if (img.updateCheck.hasUpdate) return <span className="text-sm text-amber-500 dark:text-amber-400 font-medium">Update available</span>;
        return <span className="text-sm text-green-600 dark:text-green-400">Current</span>;
      },
    });

    actionFields.push({
      listLabel: null,
      listItemRender: (img) => (
        <div className="flex gap-1 mt-2 md:mt-0 justify-center" onClick={(e) => e.stopPropagation()}>
          <ActionButton
            icon={RefreshCw}
            onClick={() => handleCheckUpdate(img)}
            tooltip="Check for Updates"
            color="blue"
            disabled={!img.updateCheck || !img.repoTags[0] || img.repoTags[0] === "<none>"}
          />
          <ActionButton
            icon={Download}
            onClick={() => handlePullImage(img)}
            tooltip="Update Image and Container"
            color="green"
            disabled={!img.updateCheck?.hasUpdate || !!imagePullStatus[img.repoTags[0] ?? ""]}
          />
          <DataAction rowId={img.id} menuEntries={buildDeleteMenuEntries(img)} />
        </div>
      ),
    });

    return [
      { fields: contentFields, columnClassName: "flex-1" },
      { fields: actionFields, columnClassName: "md:text-right" },
    ];
  };

  const tableColumns = buildTableDefinitions();
  const listColumns = buildListDefinitions();

  return (
    <DataMultiView
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
            <Scissors size={16} className={isPruning ? "inline mr-1 animate-spin" : "inline mr-1"} />
            Prune
          </button>
        </>
      }
      data={currentItems}
      keyField="id"
      tableDef={tableColumns}
      listColumns={listColumns}
      emptyMessage="No Images found."
      viewModeStorageKey="imageOverviewViewMode"
      pagination={{
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        onPageChange: goToPage,
        onItemsPerPageChange: setItemsPerPage,
      }}
    />
  );
};
