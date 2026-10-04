import { useMemo } from "react";
import { type To } from "react-router-dom";
import { Download, Layers, RefreshCw } from "lucide-react";
import { CLIENT_STATUS } from "@dim/shared";
import {
    ActionButton,
    Badge,
    EntityHeader,
    type EntityDetailGroup,
    useConfirm,
    LoadingIndicator,
    PAGE_SIZE,
} from "@stefgo/react-ui-components";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { clientName } from "../../../utils";
import { ActivityView } from "../../activity/components/ActivityView";
import { clientGroup, imageDetails, imageRefLink, nextImageGroup } from "../../containers/instanceDetails";
import { UpdateStatus } from "../lib/updateStatus";
import { clientImageActivityFilter } from "../activityFilter";
import { describePull } from "../confirmations";
import { updateStatusOf } from "../lib/updateStatus";
import { isCheckingImage, normalizeImageId, shortDigest } from "../lib/digest";
import { useClients } from "../../../queries/clients";
import { useCheckingImages, useDockerState, useUpdatingImages } from "../../../queries/docker";
import { ROUTES, clientTab } from "../../../lib/paths";
import { HeaderBreadcrumb } from "../../app/HeaderBreadcrumb";
import { ENTITY_HEADER } from "../../../components/entityHeader";
import { STORAGE_KEYS } from "../../../lib/storageKeys";

// `none` gets no badge: an image without a registry digest has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

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
    const { confirm } = useConfirm();

    const clients = useClients().clients;
    const dockerState = useDockerState(clientId);
    const checkingImages = useCheckingImages();
    const updatingImages = useUpdatingImages();
    const { checkImageUpdate, updateImage } = useDockerActions();


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

    // The host's image list: the tab of the client page this page is opened from. The
    // parent in the route tree is that page, and the tab is said here.
    const back: To = clientId ? clientTab(clientId, "images") : ROUTES.clients;
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
    const updating = !!ref && !!clientId && !!updatingImages[`${clientId}::${ref}`];
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

    const title = ref ?? `<none>:<none> @ ${shortDigest(id)}`;

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Images entry in the navigation.
                leading={<Layers size={24} className="text-text-muted" />}
                // The trail only knows this page as "Image"; the heading says which one.
                title={<HeaderBreadcrumb current={title}>{title}</HeaderBreadcrumb>}
                classNames={ENTITY_HEADER}
                actionsBelow
                meta={
                    <>
                        {updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                        {!inUse && <Badge variant="neutral">Unused</Badge>}
                    </>
                }
                detailGroups={detailGroups}
                detailColumns={3}
                // Names the view, not the image: one entry for every client image page.
                persist={{ key: STORAGE_KEYS.clientImageDetails, scope: "local" }}
                actions={
                    <div className="flex items-center gap-1">
                        <ActionButton
                            icon={RefreshCw}
                            onClick={() => ref && checkImageUpdate(ref, image.repoDigests)}
                            tooltip={{
                                enabled: "Check for updates",
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
                persistKey={STORAGE_KEYS.clientImageActivityView}
                pageSize={PAGE_SIZE.page}
            />
        </div>
    );
};
