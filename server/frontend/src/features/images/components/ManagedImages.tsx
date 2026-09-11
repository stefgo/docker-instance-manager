import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { DataAction } from "@stefgo/react-ui-components";
import { useImagesData, ImageTreeNode, TagNode, DigestNode } from "../hooks/useImagesData";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";
import { ImageRepositoryList } from "./ImageRepositoryList";

function canCheck(node: ImageTreeNode): boolean {
    return node.repository !== "<none>" &&
        (node.nodeType === "digest" ? node.tag !== "<none>" :
         node.nodeType === "tag" ? node.tag !== "<none>" :
         node.children?.some((t) => t.tag !== "<none>") ?? false);
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
    const { token } = useAuth();
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
        if (!token) return;
        for (const digest of collectTaggedDigests(node)) {
            updateImage(`${digest.repository}:${digest.tag}`, digest.clientIds, token);
        }
    }, [token, updateImage]);

    const handleCheckUpdate = useCallback((node: ImageTreeNode) => {
        if (!token) return;
        for (const digest of collectTaggedDigests(node)) {
            checkImageUpdate(`${digest.repository}:${digest.tag}`, digest.repoDigests, token);
        }
    }, [token, checkImageUpdate]);

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const handleCheckAll = useCallback(() => {
        for (const repo of images) {
            if (canCheck(repo)) handleCheckUpdate(repo);
        }
    }, [images, handleCheckUpdate]);

    const handlePruneClick = useCallback(() => {
        if (!token || prunableNodes.length === 0) return;
        setIsPruning(true);
        Promise.all(
            prunableNodes.flatMap((node) => {
                if (node.tag === "<none>") {
                    return node.imageIds.map((imageId) => removeImage(imageId, node.clientIds, token));
                }
                return [removeImage(`${node.repository}:${node.tag}`, node.clientIds, token)];
            }),
        ).finally(() => setIsPruning(false));
    }, [token, prunableNodes, removeImage]);

    const handlePruneNode = useCallback((node: ImageTreeNode) => {
        if (!token) return;
        const refs = collectPrunableRefs(node);
        if (refs.length === 0) return;
        setPruningNodes((prev) => ({ ...prev, [node.id]: true }));
        Promise.all(
            refs.map(({ ref, clientIds }) => removeImage(ref, clientIds, token)),
        ).finally(() => setPruningNodes((prev) => ({ ...prev, [node.id]: false })));
    }, [token, removeImage]);

    return (
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
                                onClick: () => handlePruneNode(node),
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
                        onClick={handlePruneClick}
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
    );
};
