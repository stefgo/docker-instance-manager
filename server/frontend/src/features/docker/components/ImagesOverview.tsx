import { useMemo, useEffect } from "react";
import { Monitor, Layers } from "lucide-react";
import { DockerContainer } from "@dim/shared";
import { DataExtendedTable, DataTableDef, DataCard } from "@stefgo/react-ui-components";
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

const STATE_COLORS: Record<string, string> = {
  running: "bg-green-500",
  exited: "bg-border dark:bg-border-dark",
  paused: "bg-yellow-400",
  restarting: "bg-blue-400 animate-pulse",
  dead: "bg-red-500",
  created: "bg-purple-400",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ImagesOverview = () => {
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

  const itemDef: DataTableDef<AggregatedImage>[] = [
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
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => <span>{img.clientUsages.length}</span>,
    },
    {
      tableHeader: "Container",
      tableCellClassName: "text-sm text-text-muted dark:text-text-muted-dark",
      tableItemRender: (img) => (
        <span>{img.clientUsages.reduce((sum, u) => sum + u.containers.length, 0)}</span>
      ),
    },
  ];

  const expandedRowRender = (img: AggregatedImage) => (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-border dark:border-border-dark">
          <th className="py-1 pr-6 text-left font-medium text-text-muted dark:text-text-muted-dark uppercase tracking-wider w-1/4">Client</th>
          <th className="py-1 pr-6 text-left font-medium text-text-muted dark:text-text-muted-dark uppercase tracking-wider">Container</th>
          <th className="py-1 text-left font-medium text-text-muted dark:text-text-muted-dark uppercase tracking-wider">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border dark:divide-border-dark">
        {img.clientUsages.map((usage) =>
          usage.containers.length > 0 ? (
            usage.containers.map((c, i) => {
              const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
              const color = STATE_COLORS[c.state] ?? "bg-border dark:bg-border-dark";
              return (
                <tr key={c.id} className="text-text-primary dark:text-text-primary-dark">
                  {i === 0 && (
                    <td className="py-1.5 pr-6 align-top" rowSpan={usage.containers.length}>
                      <div className="flex items-center gap-1.5 text-text-muted dark:text-text-muted-dark">
                        <Monitor size={12} className="flex-shrink-0" />
                        <span>{usage.clientName}</span>
                      </div>
                    </td>
                  )}
                  <td className="py-1.5 pr-6">{name}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
                      <span className="text-text-muted dark:text-text-muted-dark">{c.status}</span>
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr key={usage.clientId} className="text-text-muted dark:text-text-muted-dark">
              <td className="py-1.5 pr-6">
                <div className="flex items-center gap-1.5">
                  <Monitor size={12} className="flex-shrink-0" />
                  <span>{usage.clientName}</span>
                </div>
              </td>
              <td className="py-1.5 pr-6 italic" colSpan={2}>Keine aktiven Container</td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );

  return (
    <DataCard 
      title={
        <>
          <Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images
        </>
      }
      noPadding>
      <DataExtendedTable
        data={currentItems}
        keyField="id"
        itemDef={itemDef}
        expandOnRowClick
        expandedRowRender={expandedRowRender}
        expandedColSpan={itemDef.length}
        emptyMessage="Keine Images gefunden."
        pagination={{
          currentPage,
          totalPages,
          itemsPerPage,
          totalItems,
          onPageChange: goToPage,
          onItemsPerPageChange: setItemsPerPage,
        }}
      />
    </DataCard>
  );
};
