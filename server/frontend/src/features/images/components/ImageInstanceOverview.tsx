import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Download, Layers, RefreshCw } from "lucide-react";
import { CLIENT_STATUS, DockerContainer, DockerImage } from "@dim/shared";
import {
    ActionButton,
    Badge,
    EntityHeader,
    type EntityDetailGroup,
    useConfirm,
} from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { PAGE_SIZE } from "../../../components/listDefaults";
import { clientName } from "../../../utils";
import { ActivityView } from "../../activity/components/ActivityView";
import { clientGroup, imageDetails, imageRefLink, nextImageGroup } from "../../containers/instanceDetails";
import { UpdateStatus } from "../hooks/useImagesData";
import { imageInstanceActivityFilter } from "../activityFilter";
import { describePull } from "../confirmations";
import { imageRefKey, isCheckingImage, normalizeImageId } from "../lib/digest";
import { ImageContainerList } from "./ImageContainerList";

// `none` gets no badge: an image without a registry digest has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

/** The same reading as the Update column of the image list: only an image in use is checked. */
function updateStatusOf(image: DockerImage | undefined, inUse: boolean): UpdateStatus {
    if (!image || !inUse || image.repoDigests.length === 0) return "none";
    const check = image.updateCheck;
    if (!check || check.error) return "unchecked";
    return check.hasUpdate ? "update" : "current";
}

interface ImageInstanceOverviewProps {
    clientId: string | undefined;
    /** `repository:tag`, already decoded by the router. */
    imageRef: string | undefined;
}

/**
 * One image reference on one host: the image the tag points to there, the containers created
 * from it, and the activity recorded for both.
 *
 * The page is addressed by reference, not by image id: a pull moves the tag to a newer image,
 * and the page shows that one from then on. A container still running the image from before
 * stays listed, since it was created from the same reference.
 */
export const ImageInstanceOverview = ({ clientId, imageRef }: ImageInstanceOverviewProps) => {
    const { state } = useLocation();
    const { confirm } = useConfirm();

    const clients = useClientStore((s) => s.clients);
    const dockerState = useDockerStore((s) => (clientId ? s.dockerStates[clientId] : undefined));
    const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const imageUpdateStatus = useDockerStore((s) => s.imageUpdateStatus);
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const updateImage = useDockerStore((s) => s.updateImage);

    // A link opened directly arrives before any list has asked for the host's state.
    useEffect(() => {
        if (clientId) fetchDockerState(clientId);
    }, [clientId, fetchDockerState]);

    const ref = imageRef ?? "";
    const key = imageRefKey(ref);
    const image = dockerState?.images.find((i) => i.repoTags.some((t) => imageRefKey(t) === key));

    // Created from the reference, or running the image it points to now.
    const containers = useMemo(
        () =>
            (dockerState?.containers ?? []).filter(
                (c) =>
                    imageRefKey(c.configImage ?? c.image) === key ||
                    (!!image && normalizeImageId(c.imageId) === normalizeImageId(image.id)),
            ),
        [dockerState, key, image],
    );

    const client = clients.find((c) => c.id === clientId);
    const clientInfo = useMemo(
        () => ({
            name: client ? clientName(client) : clientId ?? "",
            online: client?.status === CLIENT_STATUS.ONLINE,
        }),
        [client, clientId],
    );
    const clientLabelMap = useMemo(
        () => new Map(clientId ? [[clientId, clientInfo]] : []),
        [clientId, clientInfo],
    );
    const containerClientMap = useMemo(
        () => new Map(clientId ? containers.map((c: DockerContainer) => [c.id, clientId]) : []),
        [containers, clientId],
    );
    const imageByIdMap = useMemo(
        () => new Map((dockerState?.images ?? []).map((i) => [normalizeImageId(i.id), i])),
        [dockerState],
    );

    const activityFilter = useMemo(
        () => (clientId && key ? imageInstanceActivityFilter(clientId, ref, containers) : undefined),
        [clientId, key, ref, containers],
    );

    // The list that opened this page says where it is. A URL opened directly leads back to
    // the reference's page across all hosts.
    const fleetPath = `/image/${encodeURIComponent(ref)}`;
    const back = (state as { from?: string } | null)?.from ?? fleetPath;
    useEscapeToLeave(back);

    if (!image && containers.length === 0) {
        return !dockerState ? (
            <LoadingIndicator label="Loading images…" />
        ) : (
            <NotFoundCard title="Image not found" backTo={back} backLabel="Back">
                No image <strong>{ref}</strong> on client <strong>{clientInfo.name}</strong>.
            </NotFoundCard>
        );
    }

    const inUse = containers.length > 0;
    const updateStatus = updateStatusOf(image, inUse);
    const updateBadge = UPDATE_BADGE[updateStatus];
    const repoDigests = image?.repoDigests ?? [];
    const checking = isCheckingImage(checkingImages, repoDigests, ref);
    const updating = !!clientId && !!imageUpdateStatus[`${clientId}::${ref}`];
    const canCheck = inUse && repoDigests.length > 0;

    const imageGroup: EntityDetailGroup = {
        key: "image",
        title: "Image",
        leading: <Layers size={16} />,
        meta: !image && <Badge variant="neutral">Not listed on this host</Badge>,
        details: [
            { label: "Reference", value: imageRefLink(ref), copyable: ref, visibility: "always" },
            ...(image ? imageDetails(image) : []),
        ],
    };
    const detailGroups = [
        clientGroup({ clientId: clientId ?? "", clientName: clientInfo.name, clientOnline: clientInfo.online }, client),
        imageGroup,
        nextImageGroup(image),
    ];

    // The pull's progress shows on the button, so the dialog closes right away instead of
    // waiting for it.
    const pull = async () => {
        if (!clientId) return;
        if (await confirm(describePull([{ imageRef: ref, clientIds: [clientId] }], inUse))) {
            updateImage(ref, [clientId]);
        }
    };

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Images entry in the navigation.
                leading={<Layers size={24} className="text-text-muted" />}
                title={ref}
                meta={
                    <>
                        {updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                        {!inUse && <Badge variant="neutral">Unused</Badge>}
                    </>
                }
                detailGroups={detailGroups}
                detailColumns={3}
                // Names the view, not the image: one entry for every image instance page.
                persist={{ key: "dim.imageInstance.details", scope: "local" }}
                actions={
                    <div className="flex items-center gap-1">
                        <ActionButton
                            icon={RefreshCw}
                            onClick={() => checkImageUpdate(ref, repoDigests)}
                            tooltip={{
                                enabled: "Check for Update",
                                disabled: checking
                                    ? "Checking…"
                                    : inUse ? "This image cannot be checked" : "No container runs this image",
                            }}
                            color="blue"
                            disabled={!canCheck || checking}
                            classNames={{ icon: checking ? "animate-spin" : "" }}
                        />
                        <ActionButton
                            icon={Download}
                            onClick={pull}
                            tooltip={{
                                enabled: inUse ? "Pull & Recreate" : "Pull",
                                disabled: !clientInfo.online
                                    ? "Client offline"
                                    : updating
                                        ? "Pulling…"
                                        : "No update available",
                            }}
                            color="green"
                            disabled={!clientInfo.online || updateStatus !== "update" || updating}
                        />
                    </div>
                }
            />

            <ImageContainerList
                searchParamKey="search.containers"
                containers={containers}
                clientLabelMap={clientLabelMap}
                containerClientMap={containerClientMap}
                checkingImages={checkingImages}
                imageByIdMap={imageByIdMap}
            />

            {/* What happened to the reference and its containers on this host. */}
            <ActivityView
                filter={activityFilter}
                searchParamKey="search.activity"
                persistKey="imageInstanceActivityView"
                pageSize={PAGE_SIZE.page}
            />
        </div>
    );
};
