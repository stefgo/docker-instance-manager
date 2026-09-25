import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { Button, DataAction, useConfirm } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode } from "../hooks/useImagesData";
import { useImageNodeActions } from "../hooks/useImageNodeActions";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ImageRepositoryList } from "./ImageRepositoryList";
import { describePruneAll, describePruneNode } from "../confirmations";
import { shortDigest } from "../lib/digest";
import { filterImages } from "../lib/filterImages";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";

/** How a tree row names itself in the prune dialog. */
function pruneLabel(node: ImageTreeNode): string {
    if (node.nodeType === "repository") return node.repository;
    if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
    return `${node.repository}:${node.tag}@${shortDigest(node.digest)}`;
}

function canPrune(node: ImageTreeNode): boolean {
    if (node.nodeType === "digest") return node.containerIds.length === 0;
    return (node.children ?? []).some(canPrune);
}

type PruneRef = { ref: string; clientIds: string[] };

/**
 * What removing the unused images below a row takes. It reads the digest rows the row has,
 * which a search may have narrowed: an unused tag is removed only on the hosts of the digests
 * the list still shows, not on every host that has it.
 */
function collectPrunableRefs(node: ImageTreeNode): PruneRef[] {
    if (node.nodeType === "digest") {
        if (node.containerIds.length > 0) return [];
        return node.imageIds.map((id) => ({ ref: id, clientIds: node.clientIds }));
    }
    const children: ImageTreeNode[] = node.children ?? [];
    if (node.nodeType === "tag" && node.tag !== "<none>" && node.containerIds.length === 0) {
        const clientIds = new Set(children.flatMap((d) => d.clientIds));
        return [{ ref: `${node.repository}:${node.tag}`, clientIds: Array.from(clientIds) }];
    }
    return children.flatMap(collectPrunableRefs);
}

/** One entry per reference, with the hosts of every entry that named it. */
function mergeRefs(refs: PruneRef[]): PruneRef[] {
    const byRef = new Map<string, Set<string>>();
    for (const { ref, clientIds } of refs) {
        if (!byRef.has(ref)) byRef.set(ref, new Set());
        for (const clientId of clientIds) byRef.get(ref)!.add(clientId);
    }
    return Array.from(byRef, ([ref, clientIds]) => ({ ref, clientIds: Array.from(clientIds) }));
}

interface ManagedImagesProps {
    /** Limits the list to the images one project runs on. */
    projectId?: string;
    searchParamKey?: string;
}

export const ManagedImages = ({ projectId, searchParamKey }: ManagedImagesProps = {}) => {
    const { checkingImages, imageUpdateStatus, removeImage } = useDockerStore();
    const images = useImagesData(projectId);
    const { checkUpdate, pull, isChecking, isUpdating, isAnyChecking, canCheck, canPull, pullLabel } =
        useImageNodeActions();
    const { confirm } = useConfirm();
    const [isPruning, setIsPruning] = useState(false);
    const [pruningNodes, setPruningNodes] = useState<Record<string, boolean>>({});

    // The same search the list reads, so Prune acts on the rows it shows (on every page).
    const [searchQuery] = useSearchQueryParam(searchParamKey);

    // Every image of the list that no container uses, tagged or not, as the rows' trash
    // icons would remove it.
    const prunableRefs = useMemo(
        () => mergeRefs(filterImages(images, searchQuery).flatMap(collectPrunableRefs)),
        [images, searchQuery],
    );

    const handleCheckAll = useCallback(() => {
        for (const repo of images) {
            if (canCheck(repo)) checkUpdate(repo);
        }
    }, [images, canCheck, checkUpdate]);

    const pruneAll = async () => {
        if (prunableRefs.length === 0) return;
        setIsPruning(true);
        await Promise.all(
            prunableRefs.map(({ ref, clientIds }) => removeImage(ref, clientIds)),
        ).finally(() => setIsPruning(false));
    };

    const pruneNode = async (node: ImageTreeNode) => {
        const refs = collectPrunableRefs(node);
        if (refs.length === 0) return;
        setPruningNodes((prev) => ({ ...prev, [node.id]: true }));
        await Promise.all(
            refs.map(({ ref, clientIds }) => removeImage(ref, clientIds)),
        ).finally(() => setPruningNodes((prev) => ({ ...prev, [node.id]: false })));
    };

    // Both prune buttons ask first and keep the dialog open until the images are gone.
    const requestPruneAll = () =>
        confirm({ ...describePruneAll(prunableRefs.length), onConfirm: pruneAll });

    const requestPruneNode = (node: ImageTreeNode) =>
        confirm({
            ...describePruneNode(pruneLabel(node), collectPrunableRefs(node).length),
            onConfirm: () => pruneNode(node),
        });

    return (
        <ImageRepositoryList
            images={images}
            searchParamKey={searchParamKey}
            checkingImages={checkingImages}
            imageUpdateStatus={imageUpdateStatus}
            renderRowActions={(node) => {
                // The same reading the Update column shows, so the icon and the buttons agree.
                const checking = isChecking(node);
                const updating = isUpdating(node);
                return (
                    <DataAction
                        rowId={node.id}
                        actions={[
                            {
                                icon: RefreshCw,
                                onClick: () => checkUpdate(node),
                                tooltip: {
                                    enabled: "Check for Update",
                                    disabled: checking ? "Checking…" : "This image cannot be checked",
                                },
                                color: "blue",
                                disabled: !canCheck(node) || checking,
                            },
                            {
                                icon: Download,
                                onClick: () => pull(node),
                                tooltip: {
                                    enabled: pullLabel(node),
                                    disabled: updating ? "Pulling…" : "No update available",
                                },
                                color: "green",
                                disabled: !canPull(node) || updating,
                            },
                            {
                                icon: Trash2,
                                onClick: () => requestPruneNode(node),
                                tooltip: {
                                    enabled: "Prune",
                                    disabled: pruningNodes[node.id] ? "Pruning…" : "Every image here is in use",
                                },
                                color: "red",
                                disabled: !canPrune(node) || !!pruningNodes[node.id],
                            },
                        ]}
                    />
                );
            }}
            extraActions={
                <>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={handleCheckAll}
                        disabled={isAnyChecking}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        Check
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={requestPruneAll}
                        disabled={isPruning || prunableRefs.length === 0}
                    >
                        Prune
                    </Button>
                </>
            }
        />
    );
};
