import { useMemo, useState, useCallback } from "react";
import { CLIENT_STATUS, DockerContainer, DockerImage } from "@dim/shared";
import { useLocation } from "react-router-dom";
import { Box, Layers, MoreVertical, RefreshCw, Download, Trash2 } from "lucide-react";
import {
    ActionButton,
    ActionMenu,
    Badge,
    Button,
    DataAction,
    EntityHeader,
    type EntityDetailGroup,
    StatCard,
    TabList,
    TabPanel,
    useActionMenu,
    useConfirm,
    useTabs,
} from "@stefgo/react-ui-components";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { useImageNodeActions } from "../hooks/useImageNodeActions";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useImagesData, ImageTreeNode, RepositoryNode, UpdateStatus } from "../hooks/useImagesData";
import { useDockerClientLookup } from "../../../hooks/useDockerClientLookup";
import { ImageList } from "./ImageList";
import { ImageContainerList } from "./ImageContainerList";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { PAGE_SIZE } from "../../../components/listDefaults";
import { ActivityView } from "../../activity/components/ActivityView";
import { imageActivityFilter } from "../activityFilter";
import { EMPTY_VALUE, clientName, formatBytes } from "../../../utils";
import { isCheckingImage, normalizeImageId, shortDigest } from "../lib/digest";
import { summarizeChecks } from "../lib/checkSummary";
import { ociLabelDetails, remoteLabels } from "../lib/remoteImageDetails";
import { labelDetails, newImageGroupOf } from "../../containers/instanceDetails";
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
    return `${node.repository}:${node.tag} @ ${shortDigest(node.digest)}`;
}

export const ImageOverview = ({ imageId }: ImageOverviewProps) => {
    const images = useImagesData();
    const { dockerStates, checkingImages, checkImageUpdate, updateImage, imageUpdateStatus, removeImage } = useDockerStore();
    const { clients } = useClientStore();
    const { imageClientMap, containerClientMap } = useDockerClientLookup();
    // In the URL, like the client and project pages, so a reload and a shared link land on
    // the tab that was open. Each tab's list keeps its own search parameter.
    const [tab, setTab] = useSearchQueryParam("tab");
    const tabs = useTabs({
        tabs: TAB_VALUES,
        value: (TAB_VALUES as readonly string[]).includes(tab) ? tab : "images",
        onChange: setTab,
    });
    const { confirm } = useConfirm();
    const nodeActions = useImageNodeActions();
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();

    // The list that opened the page says where it is -- with its search; a URL opened
    // directly leads back to the image list.
    const { state } = useLocation();
    useEscapeToLeave((state as { from?: string } | null)?.from ?? "/images");

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
                (i) => normalizeImageId(i.id) === imgId,
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
        for (const img of dockerImages) map.set(normalizeImageId(img.id), img);
        return map;
    }, [dockerImages]);

    const activityFilter = useMemo(() => {
        if (!node) return undefined;
        const containers = dockerContainers.flatMap((container) => {
            const clientId = containerClientMap.get(container.id);
            return clientId ? [{ clientId, container }] : [];
        });
        return imageActivityFilter(node.repository, node.nodeType === "repository" ? undefined : node.tag, containers);
    }, [node, dockerContainers, containerClientMap]);

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const containerImageIds = useMemo(() => {
        const ids = new Set<string>();
        for (const c of dockerContainers) ids.add(normalizeImageId(c.imageId));
        return ids;
    }, [dockerContainers]);

    // Only images a container runs are checked; the same tag and digest on several hosts is
    // one request, answered by the server for each of them.
    const handleCheckAllImages = useCallback(() => {
        const seen = new Set<string>();
        for (const img of dockerImages) {
            const ref = img.repoTags[0] ?? "";
            const key = `${ref}@${img.repoDigests.join(",")}`;
            if (ref && ref !== "<none>:<none>" && img.repoDigests.length > 0
                && containerImageIds.has(normalizeImageId(img.id)) && !seen.has(key)) {
                seen.add(key);
                handleCheckUpdate(ref, img.repoDigests);
            }
        }
    }, [dockerImages, containerImageIds, handleCheckUpdate]);

    const handleCheckAllContainers = useCallback(() => {
        const seen = new Set<string>();
        for (const c of dockerContainers) {
            const img = imageByIdMap.get(normalizeImageId(c.imageId));
            const ref = img?.repoTags[0] ?? c.image;
            if (ref && ref !== "<none>:<none>" && (img?.repoDigests.length ?? 0) > 0 && !seen.has(ref)) {
                seen.add(ref);
                handleCheckUpdate(ref, img?.repoDigests ?? []);
            }
        }
    }, [dockerContainers, imageByIdMap, handleCheckUpdate]);

    const prunableImages = useMemo(() =>
        dockerImages.filter((img) => !containerImageIds.has(normalizeImageId(img.id))),
    [dockerImages, containerImageIds]);

    const [isPruning, setIsPruning] = useState(false);

    const pruneImages = useCallback(async () => {
        if (prunableImages.length === 0) return;
        setIsPruning(true);
        await Promise.all(
            prunableImages.map((img) => {
                const normalizedId = normalizeImageId(img.id);
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
            <NotFoundCard title="Image not found" backTo="/images" backLabel="Back to images">
                No image in the fleet matches <code className="font-mono text-sm">{decodedId}</code>.
            </NotFoundCard>
        );
    }

    const updateBadge = UPDATE_BADGE[node.updateStatus];

    // The latest answer any host's copy got from the registry, and what it said.
    const { lastChecked, result: checkResult } = summarizeChecks(
        dockerImages.map((img) => ({
            ...(img.updateCheck?.checkedAt ? { checkedAt: img.updateCheck.checkedAt } : {}),
            ...(img.updateCheck?.error ? { error: img.updateCheck.error } : {}),
        })),
    );

    // The labels describe one image. Where the hosts' copies are different images -- a
    // repository, or a tag pulled at different times -- they would be one host's word for all
    // of them, so the image's own labels are left out and the coming image stands alone.
    const single = new Set(dockerImages.map((img) => normalizeImageId(img.id))).size === 1
        ? dockerImages[0]
        : undefined;
    const labels = single
        ? labelDetails(single)
        : { current: [], next: ociLabelDetails(remoteLabels(dockerImages)) };

    /** Laid out like the container instance page: the image, and the one an update would bring. */
    const detailGroups: EntityDetailGroup[] = [
        {
            key: "image",
            title: "Image",
            leading: <Layers size={16} />,
            details: [
                { label: "Repository", value: node.repository, copyable: node.repository, visibility: "always" },
                ...(node.nodeType !== "repository" ? [{ label: "Tag", value: node.tag, visibility: "always" as const }] : []),
                ...(node.nodeType === "digest"
                    ? [{ label: "Digest", value: shortDigest(node.digest), copyable: node.digest, visibility: "always" as const }]
                    : []),
                {
                    label: node.nodeType === "digest" ? "Platform" : "Platforms",
                    value: (node.nodeType === "digest" ? node.platform : node.platforms.join(", ")) || EMPTY_VALUE,
                    visibility: "always",
                },
                { label: "Size", value: formatBytes(dockerImages.reduce((sum, img) => sum + img.size, 0)) },
                { label: "Last Checked", value: lastChecked },
                ...(checkResult
                    ? [{
                        label: "Check Result",
                        value: checkResult === "OK"
                            ? checkResult
                            : <span className="text-error">{checkResult}</span>,
                    }]
                    : []),
                // The source comes last in the labels and so closes the group.
                ...labels.current,
            ],
        },
        // Empty without an update, and then the header leaves the group out.
        newImageGroupOf(node.updateStatus === "update" ? labels.next : []),
    ];

    // Each entry closes the menu first: a dialog opened from it would otherwise sit under it.
    const menuAction = (action: () => void) => () => {
        closeMenu();
        action();
    };

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Images entry in the navigation.
                leading={<Layers size={24} className="text-text-muted" />}
                title={getTitle(node)}
                meta={updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                detailGroups={detailGroups}
                detailColumns={3}
                // Names the view, not the image: one entry for every image page.
                persist={{ key: "dim.image.details", scope: "local" }}
                // Check and pull, as on the row that opened the page. Prune stays with the
                // list below: it acts on the images listed there, not on this entry as such.
                actions={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Image actions"
                            onClick={(e) => openMenu(e, node.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === node.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <button
                                onClick={menuAction(() => nodeActions.checkUpdate(node))}
                                disabled={!nodeActions.canCheck(node) || nodeActions.isChecking(node)}
                                className={MENU_ENTRY}
                            >
                                <RefreshCw size={16} /> Check for Update
                            </button>
                            <button
                                onClick={menuAction(() => nodeActions.pull(node))}
                                disabled={!nodeActions.canPull(node) || nodeActions.isUpdating(node)}
                                className={MENU_ENTRY}
                            >
                                <Download size={16} /> {nodeActions.pullLabel(node)}
                            </button>
                        </ActionMenu>
                    </div>
                }
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
                    inUseImageIds={containerImageIds}
                    // The tag this page is about; on a repository page, the image's first tag in it.
                    instanceRef={(img) =>
                        node.nodeType === "repository"
                            ? img.repoTags.find((t) => t.startsWith(`${node.repository}:`))
                            : node.tag === "<none>" ? undefined : `${node.repository}:${node.tag}`}
                    renderRowActions={(img) => {
                        const ref = img.repoTags[0] ?? "";
                        const isChecking = isCheckingImage(checkingImages, img.repoDigests, ref);
                        const inUse = containerImageIds.has(normalizeImageId(img.id));
                        const canCheck = !!ref && ref !== "<none>:<none>" && img.repoDigests.length > 0 && inUse;
                        return (
                            <DataAction
                                rowId={img.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => handleCheckUpdate(ref, img.repoDigests),
                                        tooltip: {
                                            enabled: "Check for Update",
                                            disabled: isChecking
                                                ? "Checking…"
                                                : inUse ? "This image cannot be checked" : "No container runs this image",
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
                        const img = imageByIdMap.get(normalizeImageId(c.imageId));
                        const clientId = containerClientMap.get(c.id);
                        const ref = img?.repoTags[0] ?? c.image;
                        const isChecking = isCheckingImage(checkingImages, img?.repoDigests ?? [], ref);
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

            {/* What happened to the image and its containers, on every host. */}
            <ActivityView
                filter={activityFilter}
                searchParamKey="search.activity"
                persistKey="imageActivityView"
                pageSize={PAGE_SIZE.page}
            />
        </div>
    );
};
