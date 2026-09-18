import { ReactNode, useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerImage } from "@dim/shared";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { UpdateIcon } from "./UpdateIcon";
import { EMPTY_VALUE, formatBytes, formatDate } from "../../../utils";
import { ClientLabel } from "../../clients/components/ClientLabel";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { isCheckingImage, normalizeImageId } from "../lib/digest";

interface ClientInfo {
    name: string;
    online: boolean;
}

interface ImageListProps {
    images: DockerImage[];
    clientLabelMap: Map<string, ClientInfo>;
    imageClientMap: Map<string, string>;
    checkingImages: Record<string, boolean>;
    extraActions?: ReactNode;
    renderRowActions?: (img: DockerImage) => ReactNode;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ImageList = ({
    images,
    clientLabelMap,
    imageClientMap,
    checkingImages,
    extraActions,
    renderRowActions,
    searchParamKey = "search",
}: ImageListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const filteredImages = useMemo(() => {
        if (!searchQuery) return images;
        const lq = searchQuery.toLowerCase();
        return images.filter((img) => {
            const clientName = clientLabelMap.get(imageClientMap.get(normalizeImageId(img.id)) ?? "")?.name ?? "";
            return (
                img.repoTags.some((t) => t.toLowerCase().includes(lq)) ||
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
                sortValue: (img) =>
                    clientLabelMap.get(imageClientMap.get(normalizeImageId(img.id)) ?? "")?.name ?? "",
                tableItemRender: (img) => {
                    const client = clientLabelMap.get(imageClientMap.get(normalizeImageId(img.id)) ?? "");
                    return <ClientLabel name={client?.name} online={client?.online ?? false} />;
                },
            },
            {
                tableHeader: "Size",
                tableCellClassName: "text-sm text-text-muted",
                sortable: true,
                sortValue: (img) => img.size,
                tableItemRender: (img) => <>{formatBytes(img.size)}</>,
            },
            {
                tableHeader: "Created",
                tableCellClassName: "text-sm text-text-muted",
                sortable: true,
                sortValue: (img) => img.created,
                tableItemRender: (img) => <>{img.created ? formatDate(img.created) : EMPTY_VALUE}</>,
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
                    const isChecking = isCheckingImage(checkingImages, img.repoDigests, ref);
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
                tableHeader: "Actions",
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
            title={<><Layers size={18} className="text-text-muted" /> Images</>}
            viewMode={{ persist: { key: "imageOverviewImagesView", scope: "local" } }}
            data={filteredImages}
            tableDef={tableDef}
            keyField="id"
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            emptyMessage="No images found."
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            pagination={pagination(PAGE_SIZE.embedded)}
            extraActions={extraActions}
        />
    );
};
