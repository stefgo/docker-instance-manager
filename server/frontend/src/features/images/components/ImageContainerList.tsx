import { ReactNode, useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerContainer, DockerImage } from "@dim/shared";
import { Box } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { UpdateIcon } from "./UpdateIcon";
import { StatusDot } from "../../clients/components/StatusDot";
import { ClientLabel } from "../../clients/components/ClientLabel";
import { STATE_DOT } from "../../containers/containerState";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { isCheckingImage, normalizeImageId } from "../lib/digest";

interface ClientInfo {
    name: string;
    online: boolean;
}

interface ImageContainerListProps {
    containers: DockerContainer[];
    clientLabelMap: Map<string, ClientInfo>;
    containerClientMap: Map<string, string>;
    checkingImages: Record<string, boolean>;
    imageByIdMap: Map<string, DockerImage>;
    extraActions?: ReactNode;
    renderRowActions?: (container: DockerContainer) => ReactNode;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ImageContainerList = ({
    containers,
    clientLabelMap,
    containerClientMap,
    checkingImages,
    imageByIdMap,
    extraActions,
    renderRowActions,
    searchParamKey = "search",
}: ImageContainerListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

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
                    return (
                        <div className="flex items-center gap-2">
                            <StatusDot online={c.state === "running"} idleClassName={STATE_DOT[c.state]} />
                            <span className="text-sm">{name}</span>
                        </div>
                    );
                },
            },
            {
                tableHeader: "Client",
                sortable: true,
                sortValue: (c) => clientLabelMap.get(containerClientMap.get(c.id) ?? "")?.name ?? "",
                tableItemRender: (c) => {
                    const client = clientLabelMap.get(containerClientMap.get(c.id) ?? "");
                    return <ClientLabel name={client?.name} online={client?.online ?? false} />;
                },
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
                tableCellClassName: "text-sm text-text-muted",
            },
            {
                tableHeader: "Update",
                tableHeaderClassName: "text-center",
                tableCellClassName: "text-center",
                tableItemRender: (c) => {
                    const img = imageByIdMap.get(normalizeImageId(c.imageId));
                    const ref = img?.repoTags[0] ?? c.image;
                    const uc = img?.updateCheck;
                    const status = !ref || ref === "<none>:<none>" ? "none"
                        : !uc ? "unchecked"
                        : uc.error ? "unchecked"
                        : uc.hasUpdate ? "update"
                        : "current";
                    const isChecking = isCheckingImage(checkingImages, img?.repoDigests ?? [], ref);
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
            title={<><Box size={18} className="text-text-muted" /> Containers</>}
            viewMode={{ persist: { key: "imageOverviewContainersView", scope: "local" } }}
            data={filteredContainers}
            tableDef={tableDef}
            keyField="id"
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            emptyMessage="No containers found."
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            pagination={pagination(PAGE_SIZE.embedded)}
            extraActions={extraActions}
        />
    );
};
