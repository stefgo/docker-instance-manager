import { useMemo, useState, useCallback } from "react";
import { CLIENT_STATUS, DockerContainer, DockerImage } from "@dim/shared";
import { Box, Layers, RefreshCw, Download, Trash2 } from "lucide-react";
import { Card, StatCard, DataAction } from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useImagesData, ImageTreeNode, RepositoryNode } from "../hooks/useImagesData";
import { useDockerClientLookup } from "../../../hooks/useDockerClientLookup";
import { ImageList } from "./ImageList";
import { ImageContainerList } from "./ImageContainerList";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

type Tab = "images" | "containers";

interface ImageOverviewProps {
    imageId: string | undefined;
}

function findNode(trees: RepositoryNode[], id: string): ImageTreeNode | undefined {
    for (const repo of trees) {
        if (repo.id === id) return repo;
        for (const tag of repo.children ?? []) {
            if (tag.id === id) return tag;
            for (const digest of tag.children ?? []) {
                if (digest.id === id) return digest;
            }
        }
    }
    return undefined;
}

function getTitle(node: ImageTreeNode): string {
    if (node.nodeType === "repository") return node.repository;
    if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
    return `${node.repository}:${node.tag} @ ${node.digest.slice(0, 19)}…`;
}

export const ImageOverview = ({ imageId }: ImageOverviewProps) => {
    const images = useImagesData();
    const { dockerStates, checkingImages, checkImageUpdate, updateImage, imageUpdateStatus, removeImage } = useDockerStore();
    const { clients } = useClientStore();
    const { imageClientMap, containerClientMap } = useDockerClientLookup();
    const [activeTab, setActiveTab] = useState<Tab>("images");

    const handleCheckUpdate = useCallback((ref: string, repoDigests: string[]) => {
        if (!ref || ref === "<none>:<none>" || repoDigests.length === 0) return;
        checkImageUpdate(ref, repoDigests);
    }, [checkImageUpdate]);

    const handleUpdateImage = useCallback((ref: string, clientIds: string[]) => {
        if (!ref || ref === "<none>:<none>") return;
        updateImage(ref, clientIds);
    }, [updateImage]);

    const decodedId = imageId ? decodeURIComponent(imageId) : undefined;
    const node = decodedId ? findNode(images, decodedId) : undefined;

    const clientLabelMap = useMemo(() => {
        const map = new Map<string, { name: string; online: boolean }>();
        for (const client of clients) {
            map.set(client.id, {
                name: client.displayName ?? client.hostname ?? client.id,
                online: client.status === CLIENT_STATUS.ONLINE,
            });
        }
        return map;
    }, [clients]);

    const { dockerImages, dockerContainers } = useMemo(() => {
        if (!node) return { dockerImages: [] as DockerImage[], dockerContainers: [] as DockerContainer[] };

        const collectedImages = new Map<string, DockerImage>();
        const collectedContainers = new Map<string, DockerContainer>();

        for (const imgId of node.imageIds) {
            const clientId = imageClientMap.get(imgId);
            if (!clientId) continue;
            const img = dockerStates[clientId]?.images.find(
                (i) => (i.id.startsWith("sha256:") ? i.id : `sha256:${i.id}`) === imgId,
            );
            if (img && !collectedImages.has(imgId)) collectedImages.set(imgId, img);
        }

        for (const containerId of node.containerIds) {
            const clientId = containerClientMap.get(containerId);
            if (!clientId) continue;
            const container = dockerStates[clientId]?.containers.find((c) => c.id === containerId);
            if (container && !collectedContainers.has(containerId)) collectedContainers.set(containerId, container);
        }

        return {
            dockerImages: Array.from(collectedImages.values()),
            dockerContainers: Array.from(collectedContainers.values()),
        };
    }, [node, imageClientMap, containerClientMap, dockerStates]);

    const imageByIdMap = useMemo(() => {
        const map = new Map<string, DockerImage>();
        for (const img of dockerImages) {
            const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
            map.set(normalizedId, img);
        }
        return map;
    }, [dockerImages]);

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const handleCheckAllImages = useCallback(() => {
        for (const img of dockerImages) {
            const ref = img.repoTags[0] ?? "";
            if (ref && ref !== "<none>:<none>" && img.repoDigests.length > 0) {
                handleCheckUpdate(ref, img.repoDigests);
            }
        }
    }, [dockerImages, handleCheckUpdate]);

    const handleCheckAllContainers = useCallback(() => {
        const seen = new Set<string>();
        for (const c of dockerContainers) {
            const normalizedImageId = c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`;
            const img = imageByIdMap.get(normalizedImageId);
            const ref = img?.repoTags[0] ?? c.image;
            if (ref && ref !== "<none>:<none>" && (img?.repoDigests.length ?? 0) > 0 && !seen.has(ref)) {
                seen.add(ref);
                handleCheckUpdate(ref, img?.repoDigests ?? []);
            }
        }
    }, [dockerContainers, imageByIdMap, handleCheckUpdate]);

    const containerImageIds = useMemo(() => {
        const ids = new Set<string>();
        for (const c of dockerContainers) {
            ids.add(c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`);
        }
        return ids;
    }, [dockerContainers]);

    const prunableImages = useMemo(() =>
        dockerImages.filter((img) => {
            const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
            return !containerImageIds.has(normalizedId);
        }),
    [dockerImages, containerImageIds]);

    const [isPruning, setIsPruning] = useState(false);

    const pruneImages = useCallback(async () => {
        if (prunableImages.length === 0) return;
        setIsPruning(true);
        await Promise.all(
            prunableImages.map((img) => {
                const normalizedId = img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`;
                const clientId = imageClientMap.get(normalizedId);
                const ref = img.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : normalizedId;
                return clientId ? removeImage(ref, [clientId]) : Promise.resolve();
            }),
        ).finally(() => setIsPruning(false));
    }, [prunableImages, imageClientMap, removeImage]);

    // The Prune button only asks; confirmPrune runs it and keeps the dialog until it is done.
    const [isPruneDialogOpen, setIsPruneDialogOpen] = useState(false);

    const confirmPrune = async () => {
        await pruneImages();
        setIsPruneDialogOpen(false);
    };

    if (!node) {
        return (
            <p className="text-text-muted dark:text-text-muted-dark text-sm py-8 text-center">
                {images.length === 0 ? "Lade Images…" : "Element nicht gefunden."}
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <Card
                title={
                    <h2 className="text-2xl font-bold">{getTitle(node)}</h2>
                }
            />

            <div className="grid grid-cols-2 gap-4">
                <div className={activeTab === "images" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
                    <StatCard
                        label="Images"
                        value={String(node.imageIds.length)}
                        icon={<Layers size={20} />}
                        onClick={() => setActiveTab("images")}
                    />
                </div>
                <div className={activeTab === "containers" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
                    <StatCard
                        label="Container"
                        value={String(node.containerIds.length)}
                        icon={<Box size={20} />}
                        onClick={() => setActiveTab("containers")}
                    />
                </div>
            </div>

            {activeTab === "images" && (
                <ImageList
                    images={dockerImages}
                    clientLabelMap={clientLabelMap}
                    imageClientMap={imageClientMap}
                    checkingImages={checkingImages}
                    renderRowActions={(img) => {
                        const ref = img.repoTags[0] ?? "";
                        const isChecking = img.repoDigests.length > 0
                            ? img.repoDigests.some((d) => !!checkingImages[d.includes("@") ? d.slice(d.indexOf("@") + 1) : d])
                            : !!checkingImages[ref];
                        const canCheck = !!ref && ref !== "<none>:<none>" && img.repoDigests.length > 0;
                        return (
                            <DataAction
                                rowId={img.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => handleCheckUpdate(ref, img.repoDigests),
                                        tooltip: "Check for Update",
                                        color: "blue",
                                        disabled: !canCheck || isChecking,
                                    },
                                ]}
                            />
                        );
                    }}
                    extraActions={
                        <>
                            <button
                                onClick={handleCheckAllImages}
                                disabled={isAnyChecking}
                                title="Check all for updates"
                                className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
                                Check
                            </button>
                            <button
                                onClick={() => setIsPruneDialogOpen(true)}
                                disabled={isPruning || prunableImages.length === 0}
                                title={`Remove ${prunableImages.length} unused image(s)`}
                                className="flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Trash2 size={13} />
                                Prune
                            </button>
                        </>
                    }
                />
            )}

            {activeTab === "containers" && (
                <ImageContainerList
                    containers={dockerContainers}
                    clientLabelMap={clientLabelMap}
                    containerClientMap={containerClientMap}
                    checkingImages={checkingImages}
                    imageByIdMap={imageByIdMap}
                    renderRowActions={(c) => {
                        const normalizedImageId = c.imageId.startsWith("sha256:") ? c.imageId : `sha256:${c.imageId}`;
                        const img = imageByIdMap.get(normalizedImageId);
                        const clientId = containerClientMap.get(c.id);
                        const ref = img?.repoTags[0] ?? c.image;
                        const repoDigests = img?.repoDigests ?? [];
                        const isChecking = repoDigests.length > 0
                            ? repoDigests.some((d) => !!checkingImages[d.includes("@") ? d.slice(d.indexOf("@") + 1) : d])
                            : !!checkingImages[ref];
                        const isUpdating = clientId ? !!imageUpdateStatus[`${clientId}::${ref}`] : false;
                        const canCheck = !!ref && ref !== "<none>:<none>" && (img?.repoDigests.length ?? 0) > 0;
                        const hasUpdate = img?.updateCheck?.hasUpdate === true && !img.updateCheck.error;
                        return (
                            <DataAction
                                rowId={c.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => handleCheckUpdate(ref, img?.repoDigests ?? []),
                                        tooltip: "Check for Update",
                                        color: "blue",
                                        disabled: !canCheck || isChecking,
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => handleUpdateImage(ref, clientId ? [clientId] : []),
                                        tooltip: "Pull & Recreate",
                                        color: "green",
                                        disabled: !hasUpdate || isUpdating,
                                    },
                                ]}
                            />
                        );
                    }}
                    extraActions={
                        <button
                            onClick={handleCheckAllContainers}
                            disabled={isAnyChecking}
                            title="Check all for updates"
                            className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={13} className={isAnyChecking ? "animate-spin" : ""} />
                            Check
                        </button>
                    }
                />
            )}

            <ConfirmDialog
                isOpen={isPruneDialogOpen}
                onClose={() => setIsPruneDialogOpen(false)}
                onConfirm={confirmPrune}
                title={`Remove ${prunableImages.length} unused image(s)?`}
                description="The images listed here that no container uses are deleted from the hosts that have them. To be used again, an image has to be pulled again."
                confirmLabel="Remove images"
                variant="danger"
                isConfirming={isPruning}
            />
        </div>
    );
};
