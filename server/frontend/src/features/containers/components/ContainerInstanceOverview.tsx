import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Download, MoreVertical, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import {
    ActionButton,
    ActionMenu,
    Badge,
    cn,
    EntityHeader,
    useActionMenu,
    useConfirm,
} from "@stefgo/react-ui-components";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { PAGE_SIZE } from "../../../components/listDefaults";
import { ActivityView } from "../../activity/components/ActivityView";
import { UpdateStatus } from "../../images/hooks/useImagesData";
import { ClientNode, useContainersData } from "../hooks/useContainersData";
import { canStart, canStop, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { containerPath, getNodeState } from "../containerState";
import { containerInstanceActivityFilter } from "../activityFilter";
import { describeStartContainer, describeStopContainer } from "../confirmations";
import { clientGroup, containerGroup, imageGroup, newImageGroup } from "../instanceDetails";

type BadgeVariant = "success" | "warning" | "neutral" | "error";

// Keyed by Docker's own states; anything else -- `created`, `removing` -- reads as stopped.
const STATE_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
    running: { label: "Running", variant: "success" },
    paused: { label: "Paused", variant: "warning" },
    restarting: { label: "Restarting", variant: "warning" },
    dead: { label: "Dead", variant: "error" },
    unknown: { label: "Unknown", variant: "neutral" },
};
const STOPPED_BADGE = { label: "Stopped", variant: "neutral" as const };

// `none` gets no badge: a container without a pullable image has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: BadgeVariant }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

interface ContainerInstanceOverviewProps {
    clientId: string | undefined;
    /** The container's name without its leading slash, already decoded by the router. */
    containerName: string | undefined;
}

/**
 * One container on one host: what that host reports about it, the actions for it alone, and
 * the activity recorded for it there. Host, container and image share one card, each in a
 * group of its own: all three describe this one instance.
 */
export const ContainerInstanceOverview = ({ clientId, containerName }: ContainerInstanceOverviewProps) => {
    const navigate = useNavigate();
    const { state } = useLocation();

    const containers = useContainersData();
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const clients = useClientStore((s) => s.clients);
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const { confirm } = useConfirm();
    const {
        isChecking,
        isUpdating,
        checkUpdate,
        pullAndRecreate,
        start,
        stop,
        remove,
    } = useContainerActions();

    // A name is unique on its host, so at most one group has an instance that matches.
    const isInstance = (c: ClientNode) => c.clientId === clientId && c.containerName === containerName;
    const group = containers.find((g) => g.children?.some(isInstance));
    const node = group?.children?.find(isInstance);
    const groupPath = group ? containerPath(group) : "/containers";
    // The list that opened this page says where it is. A URL opened directly leads back to
    // the container's page across all hosts.
    const back = (state as { from?: string } | null)?.from ?? groupPath;

    const activityFilter = useMemo(() => (node ? containerInstanceActivityFilter(node) : undefined), [node]);

    useEscapeToLeave(back);

    if (!node) {
        return containers.length === 0 ? (
            <LoadingIndicator label="Loading containers…" />
        ) : (
            <NotFoundCard title="Container not found" backTo={groupPath} backLabel="Back">
                No container <strong>{containerName}</strong> on client{" "}
                <strong>{clientId}</strong>.
            </NotFoundCard>
        );
    }

    const container = dockerStates[node.clientId]?.containers.find((c) => c.id === node.containerId);
    const nodeState = getNodeState(node);
    const stateBadge = STATE_BADGE[nodeState] ?? STOPPED_BADGE;
    const updateBadge = UPDATE_BADGE[node.updateStatus];
    const checking = isChecking(node);
    const updating = isUpdating(node);

    const imageProps = {
        configImage: node.configImage,
        container,
        images: dockerStates[node.clientId]?.images ?? [],
    };
    const detailGroups = [
        clientGroup(node, clients.find((c) => c.id === node.clientId)),
        containerGroup(node, container, nodeState),
        // The registry check sits with the image, not the container: it is the image's.
        imageGroup(imageProps),
        newImageGroup(imageProps),
    ];

    // Out in the header rather than behind a menu, start and stop are one click away from a
    // stray one; the dialog asks first. The list keeps them in its menu, without one.
    const confirmStart = () => confirm({ ...describeStartContainer(node), onConfirm: () => start(node) });
    const confirmStop = () => confirm({ ...describeStopContainer(node), onConfirm: () => stop(node) });

    // Each entry closes the menu first: a dialog opened from it would otherwise sit under it.
    const menuAction = (action: () => void) => () => {
        closeMenu();
        action();
    };

    return (
        <div className="space-y-6">
            <EntityHeader
                leading={<Box size={24} className="text-text-muted" />}
                title={node.containerName}
                meta={
                    <>
                        <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
                        {updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                    </>
                }
                detailGroups={detailGroups}
                detailColumns={3}
                // Names the view, not the instance: one entry for every instance page.
                persist={{ key: "dim.containerInstance.details", scope: "local" }}
                actions={
                    <div className="relative flex items-center gap-1">
                        <ActionButton
                            icon={Play}
                            onClick={confirmStart}
                            tooltip={{
                                enabled: "Start",
                                disabled: node.clientOnline ? "Already running" : "Client offline",
                            }}
                            color="green"
                            disabled={!canStart(node)}
                        />
                        <ActionButton
                            icon={Square}
                            onClick={confirmStop}
                            tooltip={{
                                enabled: "Stop",
                                disabled: node.clientOnline ? "Not running" : "Client offline",
                            }}
                            color="orange"
                            disabled={!canStop(node)}
                        />
                        <ActionButton
                            icon={RefreshCw}
                            onClick={() => checkUpdate(node)}
                            tooltip={{ enabled: "Check for Update", disabled: "Checking…" }}
                            color="blue"
                            disabled={checking}
                            classNames={{ icon: checking ? "animate-spin" : "" }}
                        />
                        <ActionButton
                            icon={Download}
                            onClick={() => pullAndRecreate(node)}
                            tooltip={{
                                enabled: "Pull & Recreate",
                                disabled: !node.clientOnline
                                    ? "Client offline"
                                    : updating
                                        ? "Pulling…"
                                        : "No update available",
                            }}
                            color="green"
                            disabled={!isReachable(node) || node.updateStatus !== "update" || updating}
                        />
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Container actions"
                            onClick={(e) => openMenu(e, node.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === node.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <button
                                onClick={menuAction(() => remove(node, () => navigate(back)))}
                                disabled={!isReachable(node)}
                                className={cn(MENU_ENTRY, "text-error")}
                            >
                                <Trash2 size={16} /> Remove
                            </button>
                        </ActionMenu>
                    </div>
                }
            />

            {/* What happened to the container on this host, across its recreates. */}
            <ActivityView
                filter={activityFilter}
                searchParamKey="search.activity"
                persistKey="containerInstanceActivityView"
                pageSize={PAGE_SIZE.page}
            />
        </div>
    );
};
