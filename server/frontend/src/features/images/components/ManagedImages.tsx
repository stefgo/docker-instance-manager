import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { Button, DataAction, useConfirm } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode, TagNode } from "../hooks/useImagesData";
import { useImageNodeActions } from "../hooks/useImageNodeActions";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ImageRepositoryList } from "./ImageRepositoryList";
import { describePruneAll, describePruneNode } from "../confirmations";

/** How a tree row names itself in the prune dialog. */
function pruneLabel(node: ImageTreeNode): string {
    if (node.nodeType === "repository") return node.repository;
    if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
    return `${node.repository}:${node.tag}@${node.digest.slice(0, 19)}`;
}

function canPrune(node: ImageTreeNode): boolean {
    if (node.nodeType === "digest") return node.containerIds.length === 0;
    return (node.children ?? []).some(canPrune);
}

function collectPrunableRefs(node: ImageTreeNode): { ref: string; clientIds: string[] }[] {
    if (node.nodeType === "digest") {
        if (node.containerIds.length > 0) return [];
        return node.imageIds.map((id) => ({ ref: id, clientIds: node.clientIds }));
    }
    if (node.nodeType === "tag") {
        if (node.containerIds.length === 0) {
            if (node.tag === "<none>") {
                return node.imageIds.map((id) => ({ ref: id, clientIds: node.clientIds }));
            }
            return [{ ref: `${node.repository}:${node.tag}`, clientIds: node.clientIds }];
        }
        return (node.children ?? []).flatMap(collectPrunableRefs);
    }
    return (node.children ?? []).flatMap(collectPrunableRefs);
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

    const prunableNodes = useMemo(() => {
        const nodes: TagNode[] = [];
        for (const repo of images) {
            for (const tag of repo.children ?? []) {
                if (tag.containerIds.length === 0) nodes.push(tag);
            }
        }
        return nodes;
    }, [images]);

    const handleCheckAll = useCallback(() => {
        for (const repo of images) {
            if (canCheck(repo)) checkUpdate(repo);
        }
    }, [images, canCheck, checkUpdate]);

    const pruneAll = async () => {
        if (prunableNodes.length === 0) return;
        setIsPruning(true);
        await Promise.all(
            prunableNodes.flatMap((node) => {
                if (node.tag === "<none>") {
                    return node.imageIds.map((imageId) => removeImage(imageId, node.clientIds));
                }
                return [removeImage(`${node.repository}:${node.tag}`, node.clientIds)];
            }),
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
        confirm({ ...describePruneAll(prunableNodes.length), onConfirm: pruneAll });

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
                        disabled={isPruning || prunableNodes.length === 0}
                    >
                        Prune
                    </Button>
                </>
            }
        />
    );
};
