import { ReactNode, useMemo, useCallback } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { DataMultiView, EmptyState, type DataColumnDef, type DataMultiViewProps, PAGE_SIZE, listPagination, TREE_LIST, treeActionsColumn, treeListGroups } from "@stefgo/react-ui-components";
import { ImageTreeNode, RepositoryNode } from "../lib/imageTree";
import { filterImages } from "../lib/filterImages";
import { UpdateIcon } from "./UpdateIcon";
import { isNodeChecking, isNodeUpdating } from "../lib/nodeStatus";
import { shortDigest } from "../lib/digest";
import { EMPTY_VALUE } from "../../../utils";
import { paths } from "../../../lib/paths";
import { STORAGE_KEYS } from "../../../lib/storageKeys";

interface ImageRepositoryListProps {
    /** The whole tree; the list applies its search to it (`filterImages`). */
    images: RepositoryNode[];
    /** A checkbox in front of every row. Its owner reads the same search to know what is shown. */
    selection?: DataMultiViewProps<ImageTreeNode>["selection"];
    extraActions?: ReactNode;
    renderRowActions?: (node: ImageTreeNode) => ReactNode;
    checkingImages: Record<string, boolean>;
    updatingImages: Record<string, boolean>;
    /** Which query parameter holds the search, so two lists on one page do not share it. */
    searchParamKey?: string;
}

export const ImageRepositoryList = ({
    images,
    selection,
    extraActions,
    renderRowActions,
    checkingImages,
    updatingImages,
    searchParamKey,
}: ImageRepositoryListProps) => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const filteredImages = useMemo(() => filterImages(images, searchQuery), [images, searchQuery]);

    // No explicit return to page 1: a new query changes `data`, and the view resets its page
    // on that by itself.

    const getChildren = useCallback((node: ImageTreeNode) => {
        if (node.nodeType === "repository") return node.children ?? null;
        if (node.nodeType === "tag") return node.children ?? null;
        return null;
    }, []);

    // One definition for the tree table and for the list a narrow screen shows instead; the
    // list keeps the name and the update status, the counts stay with the table.
    const columns: DataColumnDef<ImageTreeNode>[] = useMemo(() => {
        const updateIcon = (node: ImageTreeNode) => (
            <UpdateIcon
                status={node.updateStatus}
                isChecking={isNodeChecking(node, checkingImages)}
                isUpdating={isNodeUpdating(node, updatingImages)}
            />
        );
        const name = (node: ImageTreeNode) => {
            if (node.nodeType === "repository") {
                return <span className="text-sm font-medium truncate">{node.repository}</span>;
            }
            if (node.nodeType === "tag") {
                return <span className="text-sm truncate">{node.tag}</span>;
            }
            return (
                <span className="font-mono text-xs text-text-muted truncate" title={node.digest}>
                    {shortDigest(node.digest)}
                </span>
            );
        };

        const cols: DataColumnDef<ImageTreeNode>[] = [
            {
                header: "Repository / Tag / Image-Digest",
                sortable: true,
                sortValue: (node: ImageTreeNode) => {
                    if (node.nodeType === "repository") return node.repository;
                    if (node.nodeType === "tag") return node.tag;
                    return node.digest;
                },
                list: { label: null },
                render: (node: ImageTreeNode, view) =>
                    view === "list" ? (
                        <div className="flex items-center gap-2 min-w-0">
                            {name(node)}
                            <span className="shrink-0">{updateIcon(node)}</span>
                        </div>
                    ) : (
                        name(node)
                    ),
            },
            {
                // Only on a digest row: a repository or a tag stands for several images,
                // whose platforms need not agree.
                header: "Platform",
                sortable: true,
                sortValue: (node: ImageTreeNode) => (node.nodeType === "digest" ? node.platform : ""),
                table: { cellClassName: "text-sm text-text-muted" },
                list: false,
                render: (node: ImageTreeNode) =>
                    node.nodeType === "digest" ? <span>{node.platform || EMPTY_VALUE}</span> : null,
            },
            {
                header: "Images",
                sortable: true,
                sortValue: (node: ImageTreeNode) => node.imageIds.length,
                table: { cellClassName: "text-sm text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ImageTreeNode) => <span>{node.imageIds.length}</span>,
            },
            {
                header: "Containers",
                sortable: true,
                sortValue: (node: ImageTreeNode) => node.containerIds.length,
                table: { cellClassName: "text-sm text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ImageTreeNode) => (
                    <span>{node.containerIds.length > 0 ? node.containerIds.length : "–"}</span>
                ),
            },
            {
                header: "Up-to-date",
                table: { cellClassName: "text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ImageTreeNode) => <div className="flex justify-center">{updateIcon(node)}</div>,
            },
        ];

        if (renderRowActions) {
            cols.push(
                treeActionsColumn((node: ImageTreeNode) => (
                    <div onClick={(e) => e.stopPropagation()}>{renderRowActions(node)}</div>
                )),
            );
        }

        return cols;
    }, [checkingImages, updatingImages, renderRowActions]);

    return (
        <DataMultiView<ImageTreeNode>
            title={
                <>
                    <Layers size={18} className="text-text-muted" /> Images
                </>
            }
            extraActions={extraActions}
            viewMode={{ persist: { key: STORAGE_KEYS.imagesView, scope: "local" } }}
            data={filteredImages}
            keyField="id"
            columns={columns}
            listGroups={treeListGroups()}
            getChildren={getChildren}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            onRowClick={(node) => navigate(paths.image(node.id))}
            // The search prunes the tree in front of the view -- a row stays for a match below
            // it, which the view's own filter, asked about the top rows only, cannot say. So
            // the view never learns of the search, and "nothing here" is told from "no hit" here.
            emptyMessage={
                images.length === 0
                    ? <EmptyState icon={Layers} title="No images found" />
                    : `No images match “${searchQuery}”.`
            }
            pagination={listPagination(PAGE_SIZE.page)}
            className="h-full"
            // The header's buttons take a second line where it is narrow.
            classNames={{ list: TREE_LIST, extraActionsWrapper: "flex-wrap justify-end" }}
            selection={selection}
        />
    );
};
