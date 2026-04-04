import { ReactNode, useMemo, useState } from "react";
import { DockerContainer, DockerImage } from "@dim/shared";
import { Box } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { UpdateIcon } from "./UpdateIcon";

interface ClientLabel {
  name: string;
  online: boolean;
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

const STATE_COLORS: Record<string, string> = {
  running: "bg-green-500",
  exited: "bg-border dark:bg-border-dark",
  paused: "bg-yellow-400",
  restarting: "bg-blue-400 animate-pulse",
  dead: "bg-red-500",
  created: "bg-purple-400",
};

interface ImageContainerListProps {
  containers: DockerContainer[];
  clientLabelMap: Map<string, ClientLabel>;
  containerClientMap: Map<string, string>;
  checkingImages: Record<string, boolean>;
  imageByIdMap: Map<string, DockerImage>;
  extraActions?: ReactNode;
  renderRowActions?: (container: DockerContainer) => ReactNode;
}

export const ImageContainerList = ({
  containers,
  clientLabelMap,
  containerClientMap,
  checkingImages,
  imageByIdMap,
  extraActions,
  renderRowActions,
}: ImageContainerListProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredContainers = useMemo(() => {
    if (!searchQuery) return containers;
    const lq = searchQuery.toLowerCase();
    return containers.filter((c) => {
      const clientName = clientLabelMap.get(containerClientMap.get(c.id) ?? "")?.name ?? "";
      return (
        c.names.some((n) => n.replace(/^\//, "").toLowerCase().includes(lq)) ||
        clientName.toLowerCase().includes(lq) ||
        c.image.toLowerCase().includes(lq)
      );
    });
  }, [containers, searchQuery, clientLabelMap, containerClientMap]);

  const tableDef: DataTableDef<DockerContainer>[] = useMemo(() => {
    const cols: DataTableDef<DockerContainer>[] = [
      {
        tableHeader: "Name",
        sortable: true,
        sortValue: (c) => c.names[0]?.replace(/^\//, "") ?? c.id,
        tableItemRender: (c) => {
          const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
          const color = STATE_COLORS[c.state] ?? "bg-border dark:bg-border-dark";
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
          const repoDigests = img?.repoDigests ?? [];
          const isChecking = repoDigests.length > 0
            ? repoDigests.some((d) => !!checkingImages[d.includes("@") ? d.slice(d.indexOf("@") + 1) : d])
            : !!checkingImages[ref];
          return (
            <div className="flex justify-center">
              <UpdateIcon status={status} isChecking={isChecking} />
            </div>
          );
        },
      },
    ];

    if (renderRowActions) {
      cols.push({
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (c) => (
          <div onClick={(e) => e.stopPropagation()}>
            {renderRowActions(c)}
          </div>
        ),
      });
    }

    return cols;
  }, [clientLabelMap, containerClientMap, checkingImages, imageByIdMap, renderRowActions]);

  return (
    <DataMultiView<DockerContainer>
      title={<><Box size={18} className="text-text-muted dark:text-text-muted-dark" /> Container</>}
      viewModeStorageKey="imageOverviewContainersView"
      data={filteredContainers}
      tableDef={tableDef}
      keyField="id"
      defaultSort={{ colIndex: 0, direction: "asc" }}
      emptyMessage="No containers found."
      searchable
      searchPlaceholder="Search containers..."
      onSearchChange={setSearchQuery}
      extraActions={extraActions}
    />
  );
};
