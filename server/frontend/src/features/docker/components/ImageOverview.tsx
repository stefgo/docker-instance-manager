import { useMemo, useEffect } from "react";
import { Layers } from "lucide-react";
import { DockerContainer } from "@dim/shared";
import { DataMultiView, DataTableDef, DataListDef } from "@stefgo/react-ui-components";
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
  size: number;
  clientUsages: ClientUsage[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ImageOverview = () => {
  const { token } = useAuth();
  const { clients } = useClientStore();
  const { dockerStates, fetchDockerState } = useDockerStore();

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
            name: image.repoTags[0] ?? "<none>",
            repoTags: image.repoTags,
            size: image.size,
            clientUsages: [],
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

  const tableDef: DataTableDef<AggregatedImage>[] = [
    {
      tableHeader: "Name",
      tableItemRender: (img) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{img.name}</span>
          {img.repoTags.length > 1 && (
            <span className="text-xs text-text-muted dark:text-text-muted-dark">
              +{img.repoTags.length - 1} weiterer Tag{img.repoTags.length > 2 ? "s" : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      tableHeader: "Hash",
      tableCellClassName: "text-xs font-mono text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => (
        <span title={img.id}>{img.id.replace("sha256:", "").slice(0, 12)}</span>
      ),
    },
    {
      tableHeader: "Größe",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => <span>{formatBytes(img.size)}</span>,
    },
    {
      tableHeader: "Clients",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => <span>{img.clientUsages.length}</span>,
    },
    {
      tableHeader: "Container",
      tableCellClassName: "text-sm",
      tableItemRender: (img) => (
        <span>{img.clientUsages.reduce((sum, u) => sum + u.containers.length, 0)}</span>
      ),
    },
  ];

  const listDef: DataListDef<AggregatedImage>[] = [
    {
      listItemRender: (img) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{img.name}</span>
          {img.repoTags.length > 1 && (
            <span className="text-xs text-text-muted dark:text-text-muted-dark">
              +{img.repoTags.length - 1} weiterer Tag{img.repoTags.length > 2 ? "s" : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      listLabel: "Hash",
      listItemRender: (img) => (
        <span className="text-sm text-text-muted dark:text-text-muted-dark" title={img.id}>
          {img.id.replace("sha256:", "").slice(0, 12)}
        </span>
      ),
    },
    {
      listLabel: "Größe",
      listItemRender: (img) => (
        <span className="text-sm text-text-muted dark:text-text-muted-dark">{formatBytes(img.size)}</span>
      ),
    },
    {
      listLabel: "Clients",
      listItemRender: (img) => (
        <span className="text-sm">{img.clientUsages.length}</span>
      ),
    },
    {
      listLabel: "Container",
      listItemRender: (img) => (
        <span className="text-sm">
          {img.clientUsages.reduce((sum, u) => sum + u.containers.length, 0)}
        </span>
      ),
    },
  ];

  return (
    <DataMultiView
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      data={currentItems}
      keyField="id"
      tableDef={tableDef}
      listDef={listDef}
      emptyMessage="Keine Images gefunden."
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
