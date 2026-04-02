import { ReactNode, useMemo, useState } from "react";
import { DockerImage } from "@dim/shared";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { UpdateIcon } from "./UpdateIcon";
import { formatDate } from "../../../utils";

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

function ClientCell({ label }: { label: ClientLabel | undefined }) {
  if (!label) return <span className="text-text-muted dark:text-text-muted-dark text-sm">–</span>;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${label.online ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border dark:bg-border-dark"}`} />
      <span className="text-sm">{label.name}</span>
    </div>
  );
}

interface ImageListProps {
  images: DockerImage[];
  clientLabelMap: Map<string, ClientLabel>;
  imageClientMap: Map<string, string>;
  checkingImages: Record<string, boolean>;
  extraActions?: ReactNode;
  renderRowActions?: (img: DockerImage) => ReactNode;
}

export const ImageList = ({
  images,
  clientLabelMap,
  imageClientMap,
  checkingImages,
  extraActions,
  renderRowActions,
}: ImageListProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredImages = useMemo(() => {
    if (!searchQuery) return images;
    const lq = searchQuery.toLowerCase();
    return images.filter((img) => {
      const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
      const clientName = clientLabelMap.get(imageClientMap.get(normalizedId) ?? "")?.name ?? "";
      return (
        img.repoTags.some((t) => t.toLowerCase().includes(lq)) ||
        img.id.replace("sha256:", "").slice(0, 12).includes(lq) ||
        clientName.toLowerCase().includes(lq) ||
        (img.created ? formatDate(img.created).toLowerCase().includes(lq) : false)
      );
    });
  }, [images, searchQuery, clientLabelMap, imageClientMap]);

  const tableDef: DataTableDef<DockerImage>[] = useMemo(() => {
    const cols: DataTableDef<DockerImage>[] = [
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
    ];

    if (renderRowActions) {
      cols.push({
        tableHeader: "Action",
        tableHeaderClassName: "text-center",
        tableCellClassName: "content-center",
        tableItemRender: (img) => (
          <div onClick={(e) => e.stopPropagation()}>
            {renderRowActions(img)}
          </div>
        ),
      });
    }

    return cols;
  }, [clientLabelMap, imageClientMap, checkingImages, renderRowActions]);

  return (
    <DataMultiView<DockerImage>
      title={<><Layers size={18} className="text-text-muted dark:text-text-muted-dark" /> Images</>}
      viewModeStorageKey="imageOverviewImagesView"
      data={filteredImages}
      tableDef={tableDef}
      keyField="id"
      defaultSort={{ colIndex: 0, direction: "asc" }}
      emptyMessage="No images found."
      searchable
      searchPlaceholder="Search images..."
      onSearchChange={setSearchQuery}
      extraActions={extraActions}
    />
  );
};
