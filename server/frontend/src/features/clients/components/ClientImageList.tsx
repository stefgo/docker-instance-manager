import { useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerImage, DockerActionType } from "@dim/shared";
import { Trash2, Download, Layers } from "lucide-react";
import {
    DataMultiView,
    DataTableDef,
    DataListDef,
    DataListColumnDef,
    DataAction,
} from "@stefgo/react-ui-components";
import { formatBytes } from "../../../utils";
import { shortDigest } from "../../images/lib/digest";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";

interface ClientImageListProps {
    images: DockerImage[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ClientImageList = ({ images, onAction, searchParamKey = "search" }: ClientImageListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const filteredImages = useMemo((): DockerImage[] => {
        if (!searchQuery) return images;
        const q = searchQuery.toLowerCase();
        return images.filter(img =>
            img.repoTags.some(t => t.toLowerCase().includes(q)) ||
            img.id.replace("sha256:", "").toLowerCase().includes(q),
        );
    }, [images, searchQuery]);

    const buildMenuEntries = (img: DockerImage) => {
        const entries = [];
        if (img.repoTags[0]) {
            entries.push({ label: "Pull", icon: Download, onClick: () => onAction("image:pull", img.repoTags[0]), variant: "default" as const });
        }
        entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("image:remove", img.id), variant: "danger" as const });
        return entries;
    };

    const tableDef: DataTableDef<DockerImage>[] = [
        {
            tableHeader: "Repository / Tag",
            tableCellClassName: "text-sm text-text-primary",
            tableItemRender: (img) => <>{img.repoTags[0] ?? "<none>:<none>"}</>,
            sortable: true,
            sortValue: (img) => img.repoTags[0] ?? "",
        },
        {
            tableHeader: "ID",
            tableCellClassName: "font-mono text-xs text-text-muted",
            tableItemRender: (img) => <span title={img.id}>{shortDigest(img.id)}</span>,
            sortable: true,
            sortValue: (img) => img.id,
        },
        {
            tableHeader: "Size",
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (img) => <>{formatBytes(img.size)}</>,
            sortable: true,
            sortValue: (img) => img.size,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (img) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction rowId={img.id} menuEntries={buildMenuEntries(img)} />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<DockerImage>[] = [
        {
            fields: [
                {
                    listLabel: "Tag",
                    listItemRender: (img) => (
                        <span className="text-sm text-text-primary">
                            {img.repoTags[0] ?? "<none>:<none>"}
                        </span>
                    ),
                },
                {
                    listLabel: "ID",
                    listItemRender: (img) => (
                        <span className="text-sm" title={img.id}>{shortDigest(img.id)}</span>
                    ),
                },
                {
                    listLabel: "Size",
                    listItemRender: (img) => <span className="text-sm">{formatBytes(img.size)}</span>,
                },
            ] satisfies DataListDef<DockerImage>[],
            columnClassName: "flex-1",
        },
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (img) => (
                        <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                            <DataAction rowId={img.id} menuEntries={buildMenuEntries(img)} />
                        </div>
                    ),
                },
            ] satisfies DataListDef<DockerImage>[],
            columnClassName: "md:text-right",
        },
    ];

    return (
        <DataMultiView
            title={<><Layers size={18} className="text-text-muted" /> Images</>}
            viewMode={{ persist: { key: "dockerImageViewMode", scope: "local" } }}
            data={filteredImages}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            emptyMessage="No images found."
            pagination={pagination(PAGE_SIZE.embedded)}
        />
    );
};
