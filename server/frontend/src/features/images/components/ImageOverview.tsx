import { useMemo, useState, useCallback } from "react";
import { CLIENT_STATUS, DockerContainer, DockerImage } from "@dim/shared";
import { Box, Layers, RefreshCw, Download, Trash2 } from "lucide-react";
import {
    Badge,
    Button,
    DataAction,
    EntityHeader,
    StatCard,
    TabList,
    TabPanel,
    useConfirm,
    useTabs,
} from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useImagesData, ImageTreeNode, RepositoryNode, UpdateStatus } from "../hooks/useImagesData";
import { useDockerClientLookup } from "../../../hooks/useDockerClientLookup";
import { ImageList } from "./ImageList";
import { ImageContainerList } from "./ImageContainerList";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { clientName } from "../../../utils";
import { describePruneUnused, describePull } from "../confirmations";

const TAB_VALUES = ["images", "containers"] as const;

// `none` gets no badge: an image without a registry digest has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

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
    const tabs = useTabs({ tabs: TAB_VALUES, defaultValue: "images" });
    const { confirm } = useConfirm();

    const handleCheckUpdate = useCallback((ref: string, repoDigests: string[]) => {
        if (!ref || ref === "<none>:<none>" || repoDigests.length === 0) return;
        checkImageUpdate(ref, repoDigests);
    }, [checkImageUpdate]);

    // The pull's progress shows in the Update column, so the dialog closes right away
    // instead of waiting for it.
    const handleUpdateImage = useCallback(async (ref: string, clientIds: string[]) => {
        if (!ref || ref === "<none>:<none>") return;
        if (await confirm(describePull([{ imageRef: ref, clientIds }]))) updateImage(ref, clientIds);
    }, [confirm, updateImage]);

    const decodedId = imageId ? decodeURIComponent(imageId) : undefined;
    const node = decodedId ? findNode(images, decodedId) : undefined;

    const clientLabelMap = useMemo(() => {
        const map = new Map<string, { name: string; online: boolean }>();
        for (const client of clients) {
            map.set(client.id, {
                name: clientName(client),
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

    // The Prune button asks first and keeps the dialog open until the images are gone.
    const requestPrune = () =>
        confirm({ ...describePruneUnused(prunableImages.length), onConfirm: pruneImages });

    if (!node) {
        return images.length === 0 ? (
            <LoadingIndicator label="Loading images…" />
        ) : (
            <p className="text-text-muted text-sm py-8 text-center">Image not found.</p>
        );
    }

    const updateBadge = UPDATE_BADGE[node.updateStatus];

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Images entry in the navigation.
                leading={<Layers size={24} className="text-text-muted" />}
                title={getTitle(node)}
                meta={updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
            />

            <TabList tabs={tabs} aria-label="Image views" className="grid grid-cols-2 gap-4">
                <StatCard
                    {...tabs.tabProps("images")}
                    label="Images"
                    value={String(node.imageIds.length)}
                    icon={Layers}
                />
                <StatCard
                    {...tabs.tabProps("containers")}
                    label="Containers"
                    value={String(node.containerIds.length)}
                    icon={Box}
                />
            </TabList>

            <TabPanel tabs={tabs} value="images">
                <ImageList
                    searchParamKey="search.images"
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
                                        tooltip: {
                                            enabled: "Check for Update",
                                            disabled: isChecking ? "Checking…" : "This image cannot be checked",
                                        },
                                        color: "blue",
                                        disabled: !canCheck || isChecking,
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
                                onClick={handleCheckAllImages}
                                disabled={isAnyChecking}
                                classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                            >
                                Check
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                icon={Trash2}
                                onClick={requestPrune}
                                disabled={isPruning || prunableImages.length === 0}
                            >
                                Prune
                            </Button>
                        </>
                    }
                />
            </TabPanel>

            <TabPanel tabs={tabs} value="containers">
                <ImageContainerList
                    searchParamKey="search.containers"
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
                                        tooltip: {
                                            enabled: "Check for Update",
                                            disabled: isChecking ? "Checking…" : "This image cannot be checked",
                                        },
                                        color: "blue",
                                        disabled: !canCheck || isChecking,
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => handleUpdateImage(ref, clientId ? [clientId] : []),
                                        tooltip: {
                                            enabled: "Pull & Recreate",
                                            disabled: isUpdating ? "Pulling…" : "No update available",
                                        },
                                        color: "green",
                                        disabled: !hasUpdate || isUpdating,
                                    },
                                ]}
                            />
                        );
                    }}
                    extraActions={
                        <Button
                            size="sm"
                            icon={RefreshCw}
                            onClick={handleCheckAllContainers}
                            disabled={isAnyChecking}
                            classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                        >
                            Check
                        </Button>
                    }
                />
            </TabPanel>
        </div>
    );
};
