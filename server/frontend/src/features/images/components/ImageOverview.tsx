import { useMemo, useState } from "react";
import { DockerContainer, DockerImage } from "@dim/shared";
import { Box, Layers } from "lucide-react";
import { Card, StatCard, DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useImagesData, ImageTreeNode, RepositoryNode } from "../hooks/useImagesData";
import { useDockerClientLookup } from "../../../hooks/useDockerClientLookup";
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
  const { dockerStates } = useDockerStore();
  const { clients } = useClientStore();
  const { imageClientMap, containerClientMap } = useDockerClientLookup();
  const [activeTab, setActiveTab] = useState<Tab>("images");

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
  ], [clientLabelMap, imageClientMap]);

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
      tableHeader: "Ports",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (c) => {
        const ports = Array.from(
          new Map(
            c.ports.filter((p) => p.publicPort).map((p) => [`${p.publicPort}→${p.privatePort}/${p.type}`, p]),
          ).values(),
        ).map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`);
        if (ports.length === 0) return <>–</>;
        return <span className="break-all">{ports.join(", ")}</span>;
      },
    },
  ], [clientLabelMap, containerClientMap]);

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
          data={dockerImages}
          tableDef={imageTableDef}
          keyField="id"
          defaultSort={{ colIndex: 0, direction: "asc" }}
          emptyMessage="No images found."
        />
      )}

      {activeTab === "containers" && (
        <DataMultiView<DockerContainer>
          title={<><Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container</>}
          viewModeStorageKey="imageOverviewContainersView"
          data={dockerContainers}
          tableDef={containerTableDef}
          keyField="id"
          defaultSort={{ colIndex: 0, direction: "asc" }}
          emptyMessage="No containers found."
        />
      )}
    </div>
  );
};
