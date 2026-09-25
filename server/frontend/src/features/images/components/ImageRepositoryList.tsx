import { ReactNode, useMemo, useCallback } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useLocation, useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { ImageTreeNode, RepositoryNode } from "../hooks/useImagesData";
import { filterImages } from "../lib/filterImages";
import { UpdateIcon } from "./UpdateIcon";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { isNodeChecking, isNodeUpdating } from "../lib/nodeStatus";
import { shortDigest } from "../lib/digest";
import { EMPTY_VALUE } from "../../../utils";

interface ImageRepositoryListProps {
    images: RepositoryNode[];
    extraActions?: ReactNode;
    renderRowActions?: (node: ImageTreeNode) => ReactNode;
    checkingImages: Record<string, boolean>;
    imageUpdateStatus: Record<string, boolean>;
    /** Which query parameter holds the search, so two lists on one page do not share it. */
    searchParamKey?: string;
}

export const ImageRepositoryList = ({
    images,
    extraActions,
    renderRowActions,
    checkingImages,
    imageUpdateStatus,
    searchParamKey,
}: ImageRepositoryListProps) => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const filteredImages = useMemo(() => filterImages(images, searchQuery), [images, searchQuery]);

    // No explicit return to page 1: a new query changes `data`, and the view resets its page
    // on that by itself.

    const getChildren = useCallback((node: ImageTreeNode) => {
        if (node.nodeType === "repository") return node.children ?? null;
        if (node.nodeType === "tag") return node.children ?? null;
        return null;
    }, []);

    const columns: DataTableDef<ImageTreeNode>[] = useMemo(() => {
        const cols: DataTableDef<ImageTreeNode>[] = [
            {
                tableHeader: "Repository / Tag / Image-Digest",
                sortable: true,
                sortValue: (node: ImageTreeNode) => {
                    if (node.nodeType === "repository") return node.repository;
                    if (node.nodeType === "tag") return node.tag;
                    return node.digest;
                },
                tableItemRender: (node: ImageTreeNode) => {
                    if (node.nodeType === "repository") {
                        return <span className="text-sm font-medium">{node.repository}</span>;
                    }
                    if (node.nodeType === "tag") {
                        return <span className="text-sm">{node.tag}</span>;
                    }
                    return (
                        <span className="font-mono text-xs text-text-muted truncate" title={node.digest}>
                            {shortDigest(node.digest)}
                        </span>
                    );
                },
            },
            {
                // Only on a digest row: a repository or a tag stands for several images,
                // whose platforms need not agree.
                tableHeader: "Platform",
                sortable: true,
                sortValue: (node: ImageTreeNode) => (node.nodeType === "digest" ? node.platform : ""),
                tableCellClassName: "text-sm text-text-muted",
                tableItemRender: (node: ImageTreeNode) =>
                    node.nodeType === "digest" ? <span>{node.platform || EMPTY_VALUE}</span> : null,
            },
            {
                tableHeader: "Images",
                sortable: true,
                sortValue: (node: ImageTreeNode) => node.imageIds.length,
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ImageTreeNode) => <span>{node.imageIds.length}</span>,
            },
            {
                tableHeader: "Containers",
                sortable: true,
                sortValue: (node: ImageTreeNode) => node.containerIds.length,
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ImageTreeNode) => (
                    <span>{node.containerIds.length > 0 ? node.containerIds.length : "–"}</span>
                ),
            },
            {
                tableHeader: "Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ImageTreeNode) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={node.updateStatus}
                            isChecking={isNodeChecking(node, checkingImages)}
                            isUpdating={isNodeUpdating(node, imageUpdateStatus)}
                        />
                    </div>
                ),
            },
        ];

        if (renderRowActions) {
            cols.push({
                tableHeader: "Actions",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (node: ImageTreeNode) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        {renderRowActions(node)}
                    </div>
                ),
            });
        }

        return cols;
    }, [checkingImages, imageUpdateStatus, renderRowActions]);

    return (
        <DataMultiView<ImageTreeNode>
            title={
                <>
                    <Layers size={18} className="text-text-muted" /> Images
                </>
            }
            extraActions={extraActions}
            viewMode={{ persist: { key: "imagesViewMode", scope: "local" } }}
            data={filteredImages}
            keyField="id"
            tableDef={columns}
            getChildren={getChildren}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            // `from` is where the image page leads back to, search included.
            onRowClick={(node) =>
                navigate(`/image/${encodeURIComponent(node.id)}`, { state: { from: pathname + search } })
            }
            emptyMessage="No images found."
            pagination={pagination(PAGE_SIZE.page)}
            className="h-full"
        />
    );
};
