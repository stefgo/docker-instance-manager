import { useMemo, useState, useCallback } from "react";
import { DockerContainer, DockerImage } from "@dim/shared";
import { Box, Layers, RefreshCw, Download, Trash2 } from "lucide-react";
import { Card, StatCard, DataMultiView, DataTableDef, DataAction } from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";
import { useImagesData, ImageTreeNode, RepositoryNode } from "../hooks/useImagesData";
import { useDockerClientLookup } from "../../../hooks/useDockerClientLookup";
import { UpdateIcon } from "./UpdateIcon";
import { formatDate } from "../../../utils";

type Tab = "images" | "containers";

interface ImageOverviewProps {
  imageId: string | undefined;
}

interface ClientLabel {
  name: string;
  online: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function findNode(trees: RepositoryNode[], id: string): ImageTreeNode | undefined {
  for (const repo of trees) {
    if (repo.id === id) return repo;
    for (const tag of repo.children ?? []) {
      if (tag.id === id) return tag;
      for (const digest of tag.children ?? []) {
        if (digest.id === id) return digest;
      }
    }
  }
  return undefined;
}

function getTitle(node: ImageTreeNode): string {
  if (node.nodeType === "repository") return node.repository;
  if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
  return `${node.repository}:${node.tag} @ ${node.digest.slice(0, 19)}…`;
}

function ClientCell({ label }: { label: ClientLabel | undefined }) {
  if (!label) return <span className="text-text-muted dark:text-text-muted-dark text-sm">–</span>;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${label.online ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border dark:bg-border-dark"}`} />
      <span className="text-sm">{label.name}</span>
    </div>
  );
}

export const ImageOverview = ({ imageId }: ImageOverviewProps) => {
  const images = useImagesData();
  const { dockerStates, checkingImages, checkImageUpdate, updateImage, imageUpdateStatus, removeImage } = useDockerStore();
  const { clients } = useClientStore();
  const { token } = useAuth();
  const { imageClientMap, containerClientMap } = useDockerClientLookup();
  const [activeTab, setActiveTab] = useState<Tab>("images");
  const [imagesQuery, setImagesQuery] = useState("");
  const [containersQuery, setContainersQuery] = useState("");

  const handleCheckUpdate = useCallback((ref: string, repoDigests: string[]) => {
    if (!token || !ref || ref === "<none>:<none>" || repoDigests.length === 0) return;
    checkImageUpdate(ref, repoDigests, token);
  }, [token, checkImageUpdate]);

  const handleUpdateImage = useCallback((ref: string, clientIds: string[]) => {
    if (!token || !ref || ref === "<none>:<none>") return;
    updateImage(ref, clientIds, token);
  }, [token, updateImage]);

  const decodedId = imageId ? decodeURIComponent(imageId) : undefined;
  const node = decodedId ? findNode(images, decodedId) : undefined;

  const clientLabelMap = useMemo(() => {
    const map = new Map<string, ClientLabel>();
    for (const client of clients) {
      map.set(client.id, {
        name: client.displayName ?? client.hostname ?? client.id,
        online: client.status === "online",
      });
    }
    return map;
  }, [clients]);

  const { dockerImages, dockerContainers } = useMemo(() => {
    if (!node) return { dockerImages: [], dockerContainers: [] };

    const collectedImages = new Map<string, DockerImage>();
    const collectedContainers = new Map<string, DockerContainer>();

    for (const imgId of node.imageIds) {
      const clientId = imageClientMap.get(imgId);
      if (!clientId) continue;
      const img = dockerStates[clientId]?.images.find(
        (i) => (i.id.startsWith("sha256:") ? i.id : `sha256:${i.id}`) === imgId,
      );
      if (img && !collectedImages.has(imgId)) collectedImages.set(imgId, img);
    }

    for (const containerId of node.containerIds) {
      const clientId = containerClientMap.get(containerId);
      if (!clientId) continue;
      const container = dockerStates[clientId]?.containers.find((c) => c.id === containerId);
      if (container && !collectedContainers.has(containerId)) collectedContainers.set(containerId, container);
    }

    return {
      dockerImages: Array.from(collectedImages.values()),
      dockerContainers: Array.from(collectedContainers.values()),
    };
  }, [node, imageClientMap, containerClientMap, dockerStates]);

  const imageByIdMap = useMemo(() => {
    const map = new Map<string, DockerImage>();
    for (const img of dockerImages) {
      const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
      map.set(normalizedId, img);
    }
    return map;
  }, [dockerImages]);

  const filteredDockerImages = useMemo(() => {
    if (!imagesQuery) return dockerImages;
    const lq = imagesQuery.toLowerCase();
    return dockerImages.filter((img) => {
      const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
      const clientName = clientLabelMap.get(imageClientMap.get(normalizedId) ?? "")?.name ?? "";
      return (
        img.repoTags.some((t) => t.toLowerCase().includes(lq)) ||
        img.id.replace("sha256:", "").slice(0, 12).includes(lq) ||
        clientName.toLowerCase().includes(lq) ||
        (img.created ? formatDate(img.created).toLowerCase().includes(lq) : false)
      );
    });
  }, [dockerImages, imagesQuery, clientLabelMap, imageClientMap]);

  const filteredDockerContainers = useMemo(() => {
    if (!containersQuery) return dockerContainers;
    const lq = containersQuery.toLowerCase();
    return dockerContainers.filter((c) => {
      const clientName = clientLabelMap.get(containerClientMap.get(c.id) ?? "")?.name ?? "";
      return (
        c.names.some((n) => n.replace(/^\//, "").toLowerCase().includes(lq)) ||
        clientName.toLowerCase().includes(lq) ||
        c.image.toLowerCase().includes(lq)
      );
    });
  }, [dockerContainers, containersQuery, clientLabelMap, containerClientMap]);

  const isAnyChecking = Object.values(checkingImages).some(Boolean);

  const handleCheckAllImages = useCallback(() => {
    for (const img of filteredDockerImages) {
      const ref = img.repoTags[0] ?? "";
      if (ref && ref !== "<none>:<none>" && img.repoDigests.length > 0) {
        handleCheckUpdate(ref, img.repoDigests);
      }
    }
  }, [filteredDockerImages, handleCheckUpdate]);

  const handleCheckAllContainers = useCallback(() => {
    const seen = new Set<string>();
    for (const c of filteredDockerContainers) {
      const normalizedImageId = c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`;
      const img = imageByIdMap.get(normalizedImageId);
      const ref = img?.repoTags[0] ?? c.image;
      if (ref && ref !== "<none>:<none>" && (img?.repoDigests.length ?? 0) > 0 && !seen.has(ref)) {
        seen.add(ref);
        handleCheckUpdate(ref, img?.repoDigests ?? []);
      }
    }
  }, [filteredDockerContainers, imageByIdMap, handleCheckUpdate]);

  const containerImageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of dockerContainers) {
      ids.add(c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`);
    }
    return ids;
  }, [dockerContainers]);

  const prunableImages = useMemo(() =>
    filteredDockerImages.filter((img) => {
      const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
      return !containerImageIds.has(normalizedId);
    }),
  [filteredDockerImages, containerImageIds]);

  const [isPruning, setIsPruning] = useState(false);

  const handlePruneImages = useCallback(() => {
    if (!token || prunableImages.length === 0) return;
    setIsPruning(true);
    Promise.all(
      prunableImages.map((img) => {
        const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
        const clientId = imageClientMap.get(normalizedId);
        const ref = img.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : normalizedId;
        return clientId ? removeImage(ref, [clientId], token) : Promise.resolve();
      }),
    ).finally(() => setIsPruning(false));
  }, [token, prunableImages, imageClientMap, removeImage]);

  const imageTableDef: DataTableDef<DockerImage>[] = useMemo(() => [
    {
      tableHeader: "Repository / Tag",
      tableCellClassName: "text-sm",
      sortable: true,
      sortValue: (img) => img.repoTags[0] ?? "",
      tableItemRender: (img) => <>{img.repoTags[0] ?? "<none>:<none>"}</>,
    },
    {
      tableHeader: "Client",
      sortable: true,
      sortValue: (img) => {
        const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
        return clientLabelMap.get(imageClientMap.get(normalizedId) ?? "")?.name ?? "";
      },
      tableItemRender: (img) => {
        const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
        return <ClientCell label={clientLabelMap.get(imageClientMap.get(normalizedId) ?? "")} />;
      },
    },
    {
      tableHeader: "ID",
      tableCellClassName: "font-mono text-xs text-text-muted dark:text-text-muted-dark",
      sortable: true,
      sortValue: (img) => img.id,
      tableItemRender: (img) => <>{img.id.replace("sha256:", "").slice(0, 12)}</>,
    },
    {
      tableHeader: "Size",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      sortable: true,
      sortValue: (img) => img.size,
      tableItemRender: (img) => <>{formatBytes(img.size)}</>,
    },
    {
      tableHeader: "Created",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      sortable: true,
      sortValue: (img) => img.created,
      tableItemRender: (img) => <>{img.created ? formatDate(img.created) : "–"}</>,
    },
    {
      tableHeader: "Update",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-center",
      tableItemRender: (img) => {
        const ref = img.repoTags[0] ?? "";
        const uc = img.updateCheck;
        const status = !ref || ref === "<none>:<none>" ? "none"
          : !uc ? "unchecked"
          : uc.error ? "unchecked"
          : uc.hasUpdate ? "update"
          : "current";
        return (
          <div className="flex justify-center">
            <UpdateIcon status={status} isChecking={!!checkingImages[ref]} />
          </div>
        );
      },
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (img) => {
        const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
        const clientId = imageClientMap.get(normalizedId);
        const ref = img.repoTags[0] ?? "";
        const isChecking = !!checkingImages[ref];
        const isUpdating = !!imageUpdateStatus[ref];
        const canCheck = !!ref && ref !== "<none>:<none>" && img.repoDigests.length > 0;
        const hasUpdate = img.updateCheck?.hasUpdate === true && !img.updateCheck.error;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={img.id}
              actions={[
                {
                  icon: RefreshCw,
                  onClick: () => handleCheckUpdate(ref, img.repoDigests),
                  tooltip: "Check for Update",
                  color: "blue",
                  disabled: !canCheck || isChecking,
                },
                {
                  icon: Download,
                  onClick: () => handleUpdateImage(ref, clientId ? [clientId] : []),
                  tooltip: "Pull & Recreate",
                  color: "green",
                  disabled: !hasUpdate || isUpdating,
                },
              ]}
            />
          </div>
        );
      },
    },
  ], [clientLabelMap, imageClientMap, checkingImages, imageUpdateStatus, handleCheckUpdate, handleUpdateImage]);

  const containerTableDef: DataTableDef<DockerContainer>[] = useMemo(() => [
    {
      tableHeader: "Name",
      sortable: true,
      sortValue: (c) => c.names[0]?.replace(/^\//, "") ?? c.id,
      tableItemRender: (c) => {
        const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
        const stateColors: Record<string, string> = {
          running: "bg-green-500",
          exited: "bg-border dark:bg-border-dark",
          paused: "bg-yellow-400",
          restarting: "bg-blue-400 animate-pulse",
          dead: "bg-red-500",
          created: "bg-purple-400",
        };
        const color = stateColors[c.state] ?? "bg-border dark:bg-border-dark";
        return (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-sm">{name}</span>
          </div>
        );
      },
    },
    {
      tableHeader: "Client",
      sortable: true,
      sortValue: (c) => clientLabelMap.get(containerClientMap.get(c.id) ?? "")?.name ?? "",
      tableItemRender: (c) => (
        <ClientCell label={clientLabelMap.get(containerClientMap.get(c.id) ?? "")} />
      ),
    },
    {
      tableHeader: "Image",
      sortable: true,
      sortValue: (c) => c.image,
      tableCellClassName: "text-sm max-w-[200px] truncate",
      tableItemRender: (c) => <span>{c.image}</span>,
    },
    {
      tableHeader: "Status",
      sortable: true,
      accessorKey: "status",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
    },
    {
      tableHeader: "Update",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-center",
      tableItemRender: (c) => {
        const normalizedImageId = c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`;
        const img = imageByIdMap.get(normalizedImageId);
        const ref = img?.repoTags[0] ?? c.image;
        const uc = img?.updateCheck;
        const status = !ref || ref === "<none>:<none>" ? "none"
          : !uc ? "unchecked"
          : uc.error ? "unchecked"
          : uc.hasUpdate ? "update"
          : "current";
        return (
          <div className="flex justify-center">
            <UpdateIcon status={status} isChecking={!!checkingImages[ref]} />
          </div>
        );
      },
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "text-center",
      tableCellClassName: "content-center",
      tableItemRender: (c) => {
        const normalizedImageId = c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`;
        const img = imageByIdMap.get(normalizedImageId);
        const clientId = containerClientMap.get(c.id);
        const ref = img?.repoTags[0] ?? c.image;
        const isChecking = !!checkingImages[ref];
        const isUpdating = !!imageUpdateStatus[ref];
        const canCheck = !!ref && ref !== "<none>:<none>" && (img?.repoDigests.length ?? 0) > 0;
        const hasUpdate = img?.updateCheck?.hasUpdate === true && !img.updateCheck.error;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DataAction
              rowId={c.id}
              actions={[
                {
                  icon: RefreshCw,
                  onClick: () => handleCheckUpdate(ref, img?.repoDigests ?? []),
                  tooltip: "Check for Update",
                  color: "blue",
                  disabled: !canCheck || isChecking,
                },
                {
                  icon: Download,
                  onClick: () => handleUpdateImage(ref, clientId ? [clientId] : []),
                  tooltip: "Pull & Recreate",
                  color: "green",
                  disabled: !hasUpdate || isUpdating,
                },
              ]}
            />
          </div>
        );
      },
    },
  ], [clientLabelMap, containerClientMap, imageByIdMap, checkingImages, imageUpdateStatus, handleCheckUpdate, handleUpdateImage]);

  if (!node) {
    return (
      <p className="text-text-muted dark:text-text-muted-dark text-sm py-8 text-center">
        {images.length === 0 ? "Lade Images…" : "Element nicht gefunden."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title={
          <h2 className="text-2xl font-bold">{getTitle(node)}</h2>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <div className={activeTab === "images" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
          <StatCard
            label="Images"
            value={String(node.imageIds.length)}
            icon={<Layers size={20} />}
            onClick={() => setActiveTab("images")}
          />
        </div>
        <div className={activeTab === "containers" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
          <StatCard
            label="Container"
            value={String(node.containerIds.length)}
            icon={<Box size={20} />}
            onClick={() => setActiveTab("containers")}
          />
        </div>
      </div>

      {activeTab === "images" && (
        <DataMultiView<DockerImage>
          title={<><Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images</>}
          viewModeStorageKey="imageOverviewImagesView"
          data={filteredDockerImages}
          tableDef={imageTableDef}
          keyField="id"
          defaultSort={{ colIndex: 0, direction: "asc" }}
          emptyMessage="No images found."
          searchable
          searchPlaceholder="Search images..."
          onSearchChange={setImagesQuery}
          extraActions={
            <>
              <button
                onClick={handleCheckAllImages}
                disabled={isAnyChecking}
                title="Check all for updates"
                className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
                Check
              </button>
              <button
                onClick={handlePruneImages}
                disabled={isPruning || prunableImages.length === 0}
                title={`Remove ${prunableImages.length} unused image(s)`}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} />
                Prune
              </button>
            </>
          }
        />
      )}

      {activeTab === "containers" && (
        <DataMultiView<DockerContainer>
          title={<><Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container</>}
          viewModeStorageKey="imageOverviewContainersView"
          data={filteredDockerContainers}
          tableDef={containerTableDef}
          keyField="id"
          defaultSort={{ colIndex: 0, direction: "asc" }}
          emptyMessage="No containers found."
          searchable
          searchPlaceholder="Search containers..."
          onSearchChange={setContainersQuery}
          extraActions={
            <button
              onClick={handleCheckAllContainers}
              disabled={isAnyChecking}
              title="Check all for updates"
              className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
              Check
            </button>
          }
        />
      )}
    </div>
  );
};
