import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Download, Layers, RefreshCw } from "lucide-react";
import { CLIENT_STATUS, DockerImage } from "@dim/shared";
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
import { clientImageActivityFilter } from "../activityFilter";
import { describePull } from "../confirmations";
import { isCheckingImage, normalizeImageId, shortDigest } from "../lib/digest";

// `none` gets no badge: an image without a registry digest has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

/** The same reading as the Update column of the image list: only an image in use is checked. */
function updateStatusOf(image: DockerImage, inUse: boolean): UpdateStatus {
    if (!inUse || image.repoDigests.length === 0) return "none";
    const check = image.updateCheck;
    if (!check || check.error) return "unchecked";
    return check.hasUpdate ? "update" : "current";
}

interface ClientImageOverviewProps {
    clientId: string | undefined;
    /** The image id, already decoded by the router. */
    imageId: string | undefined;
}

/**
 * One image on one host, as a row of the client's image list names it: its host, what the host
 * reports about it, and the activity recorded for it there.
 *
 * Addressed by image id rather than by reference, so an untagged image has a page too. A pull
 * that moves the tag away leaves the page on this image.
 */
export const ClientImageOverview = ({ clientId, imageId }: ClientImageOverviewProps) => {
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

    const id = imageId ? normalizeImageId(imageId) : "";
    const image = dockerState?.images.find((i) => normalizeImageId(i.id) === id);

    // The containers that run the image; they count as its use and their events as its history.
    const containers = useMemo(
        () => (dockerState?.containers ?? []).filter((c) => normalizeImageId(c.imageId) === id),
        [dockerState, id],
    );

    const activityFilter = useMemo(
        () => (clientId && image ? clientImageActivityFilter(clientId, id, image.repoTags, containers) : undefined),
        [clientId, id, image, containers],
    );

    // The list that opened this page says where it is. A URL opened directly leads back to
    // the host's image list.
    const back = (state as { from?: string } | null)?.from
        ?? (clientId ? `/client/${encodeURIComponent(clientId)}?tab=images` : "/clients");
    useEscapeToLeave(back);

    const client = clients.find((c) => c.id === clientId);
    const name = client ? clientName(client) : clientId ?? "";
    const online = client?.status === CLIENT_STATUS.ONLINE;

    if (!image) {
        return !dockerState ? (
            <LoadingIndicator label="Loading images…" />
        ) : (
            <NotFoundCard title="Image not found" backTo={back} backLabel="Back">
                No image <code className="font-mono text-sm">{shortDigest(id)}</code> on
                client <strong>{name}</strong>.
            </NotFoundCard>
        );
    }

    const ref = image.repoTags.find((t) => t !== "<none>:<none>");
    const inUse = containers.length > 0;
    const updateStatus = updateStatusOf(image, inUse);
    const updateBadge = UPDATE_BADGE[updateStatus];
    const checking = !!ref && isCheckingImage(checkingImages, image.repoDigests, ref);
    const updating = !!ref && !!clientId && !!imageUpdateStatus[`${clientId}::${ref}`];
    const canCheck = !!ref && inUse && image.repoDigests.length > 0;

    const imageGroup: EntityDetailGroup = {
        key: "image",
        title: "Image",
        leading: <Layers size={16} />,
        details: [
            ...(ref ? [{ label: "Reference", value: imageRefLink(ref), copyable: ref, visibility: "always" as const }] : []),
            ...imageDetails(image),
        ],
    };
    const detailGroups = [
        clientGroup({ clientId: clientId ?? "", clientName: name, clientOnline: online }, client),
        imageGroup,
        nextImageGroup(image),
    ];

    // The pull's progress shows on the button, so the dialog closes right away instead of
    // waiting for it.
    const pull = async () => {
        if (!clientId || !ref) return;
        if (await confirm(describePull([{ imageRef: ref, clientIds: [clientId] }], inUse))) {
            updateImage(ref, [clientId]);
        }
    };

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Images entry in the navigation.
                leading={<Layers size={24} className="text-text-muted" />}
                title={ref ?? `<none>:<none> @ ${shortDigest(id)}`}
                meta={
                    <>
                        {updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                        {!inUse && <Badge variant="neutral">Unused</Badge>}
                    </>
                }
                detailGroups={detailGroups}
                detailColumns={3}
                // Names the view, not the image: one entry for every client image page.
                persist={{ key: "dim.clientImage.details", scope: "local" }}
                actions={
                    <div className="flex items-center gap-1">
                        <ActionButton
                            icon={RefreshCw}
                            onClick={() => ref && checkImageUpdate(ref, image.repoDigests)}
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
                                disabled: !online
                                    ? "Client offline"
                                    : updating
                                        ? "Pulling…"
                                        : "No update available",
                            }}
                            color="green"
                            disabled={!online || updateStatus !== "update" || updating}
                        />
                    </div>
                }
            />

            {/* What happened to the image and the containers that run it on this host. */}
            <ActivityView
                filter={activityFilter}
                searchParamKey="search.activity"
                persistKey="clientImageActivityView"
                pageSize={PAGE_SIZE.page}
            />
        </div>
    );
};
