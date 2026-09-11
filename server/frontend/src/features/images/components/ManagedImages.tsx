import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { DataAction } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode, TagNode, DigestNode } from "../hooks/useImagesData";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ImageRepositoryList } from "./ImageRepositoryList";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

function canCheck(node: ImageTreeNode): boolean {
    return node.repository !== "<none>" &&
        (node.nodeType === "digest" ? node.tag !== "<none>" :
         node.nodeType === "tag" ? node.tag !== "<none>" :
         node.children?.some((t) => t.tag !== "<none>") ?? false);
}

/** How a tree row names itself in the prune dialog. */
function pruneLabel(node: ImageTreeNode): string {
    if (node.nodeType === "repository") return node.repository;
    if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
    return `${node.repository}:${node.tag}@${node.digest.slice(0, 19)}`;
}

function nodeHasUpdate(node: ImageTreeNode): boolean {
    if (node.updateStatus === "update") return true;
    return false;
}

function nodeHasContainers(node: ImageTreeNode): boolean {
    if (node.nodeType === "digest") return node.containerIds.length > 0;
    return (node.children ?? []).some(nodeHasContainers);
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

/**
 * The digest nodes below `node` (or `node` itself) that carry a pullable
 * `repository:tag`. Update and check act on these; walking the tree here keeps
 * the callbacks from calling themselves recursively inside their own useCallback,
 * which reads the callback before its declaration has completed.
 */
function collectTaggedDigests(node: ImageTreeNode): DigestNode[] {
    if (node.nodeType === "digest") {
        return node.repository !== "<none>" && node.tag !== "<none>" ? [node] : [];
    }
    return (node.children ?? []).flatMap(collectTaggedDigests);
}

export const ManagedImages = () => {
    const { checkImageUpdate, checkingImages, updateImage, imageUpdateStatus, removeImage } = useDockerStore();
    const images = useImagesData();
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

    const handleUpdateImage = useCallback((node: ImageTreeNode) => {
        for (const digest of collectTaggedDigests(node)) {
            updateImage(`${digest.repository}:${digest.tag}`, digest.clientIds);
        }
    }, [updateImage]);

    const handleCheckUpdate = useCallback((node: ImageTreeNode) => {
        for (const digest of collectTaggedDigests(node)) {
            checkImageUpdate(`${digest.repository}:${digest.tag}`, digest.repoDigests);
        }
    }, [checkImageUpdate]);

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const handleCheckAll = useCallback(() => {
        for (const repo of images) {
            if (canCheck(repo)) handleCheckUpdate(repo);
        }
    }, [images, handleCheckUpdate]);

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

    // Both prune buttons only ask; confirmPrune runs what was asked about. "all" is the
    // toolbar button, a node is the trash icon on a repository, tag or digest row.
    const [pendingPrune, setPendingPrune] = useState<
        { kind: "all" } | { kind: "node"; node: ImageTreeNode } | null
    >(null);
    const [isConfirmingPrune, setIsConfirmingPrune] = useState(false);

    const confirmPrune = async () => {
        if (!pendingPrune) return;
        setIsConfirmingPrune(true);
        try {
            if (pendingPrune.kind === "all") await pruneAll();
            else await pruneNode(pendingPrune.node);
            setPendingPrune(null);
        } finally {
            setIsConfirmingPrune(false);
        }
    };

    const pruneDialog = !pendingPrune
        ? null
        : pendingPrune.kind === "all"
            ? {
                title: `Remove ${prunableNodes.length} unused image tag(s)?`,
                description: "Every image tag that no container uses is deleted from all hosts that have it. To be used again, an image has to be pulled again.",
            }
            : {
                title: `Prune unused images of "${pruneLabel(pendingPrune.node)}"?`,
                description: `${collectPrunableRefs(pendingPrune.node).length} image(s) below this entry that no container uses are deleted from all hosts that have them. To be used again, an image has to be pulled again.`,
            };

    return (
        <>
            <ImageRepositoryList
                images={images}
                checkingImages={checkingImages}
                imageUpdateStatus={imageUpdateStatus}
                renderRowActions={(node) => {
                    const toDigest = (d: string) => (d.includes("@") ? d.slice(d.indexOf("@") + 1) : d);
                    const digestsChecking = (digests: string[]) => digests.some((d) => !!checkingImages[toDigest(d)]);
                    const isChecking =
                        node.nodeType === "digest"
                            ? !!checkingImages[node.digest]
                            : node.nodeType === "tag"
                                ? node.repoDigests.length > 0
                                    ? digestsChecking(node.repoDigests)
                                    : !!checkingImages[`${node.repository}:${node.tag}`]
                                : (node.children?.some((t) =>
                                        t.repoDigests.length > 0
                                            ? digestsChecking(t.repoDigests)
                                            : !!checkingImages[`${node.repository}:${t.tag}`],
                                    ) ?? false);
                    const isUpdating =
                        node.nodeType === "repository"
                            ? (node.children?.some((t) =>
                                    t.clientIds.some(
                                        (id) =>
                                            !!imageUpdateStatus[`${id}::${node.repository}:${t.tag}`],
                                    ),
                                ) ?? false)
                            : node.clientIds.some(
                                    (id) =>
                                        !!imageUpdateStatus[`${id}::${node.repository}:${node.tag}`],
                                );
                    return (
                        <DataAction
                            rowId={node.id}
                            actions={[
                                {
                                    icon: RefreshCw,
                                    onClick: () => handleCheckUpdate(node),
                                    tooltip: { enabled: "Check for Update", disabled: "" },
                                    color: "blue",
                                    disabled: !canCheck(node) || isChecking,
                                },
                                {
                                    icon: Download,
                                    onClick: () => handleUpdateImage(node),
                                    tooltip: { enabled: nodeHasContainers(node) ? "Pull & Recreate" : "Pull", disabled: "" },
                                    color: "green",
                                    disabled: !nodeHasUpdate(node) || isUpdating,
                                },
                                {
                                    icon: Trash2,
                                    onClick: () => setPendingPrune({ kind: "node", node }),
                                    tooltip: { enabled: "Prune", disabled: "" },
                                    color: "red",
                                    disabled: !canPrune(node) || !!pruningNodes[node.id],
                                },
                            ]}
                        />
                    );
                }}
                extraActions={
                    <>
                        <button
                            onClick={handleCheckAll}
                            disabled={isAnyChecking}
                            title="Check all for updates"
                            className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
                            Check
                        </button>
                        <button
                            onClick={() => setPendingPrune({ kind: "all" })}
                            disabled={isPruning || prunableNodes.length === 0}
                            title={`Remove ${prunableNodes.length} unused image(s)`}
                            className="flex items-center gap-1.5 px-3 py-1 text-white text-xs rounded disabled:opacity-40 disabled:cursor-not-allowed bg-red-500 hover:bg-red-600"
                        >
                            <Trash2 size={13} />
                            Prune
                        </button>
                    </>
                }
            />

            <ConfirmDialog
                isOpen={!!pendingPrune}
                onClose={() => setPendingPrune(null)}
                onConfirm={confirmPrune}
                title={pruneDialog?.title ?? ""}
                description={pruneDialog?.description}
                confirmLabel="Remove images"
                variant="danger"
                isConfirming={isConfirmingPrune}
            />
        </>
    );
};
