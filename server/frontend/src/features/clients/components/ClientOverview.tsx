import { MoreVertical, Edit, RefreshCw, Box, Layers, HardDrive, Network } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../../lib/apiFetch";
import { Client, CLIENT_STATUS, CONNECTION_MODE, DockerActionType } from "@dim/shared";
import { clientName, describeFailure, formatDate } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { useDockerStore } from "../../../stores/useDockerStore";
import {
    ActionButton,
    ActionMenu,
    Badge,
    EntityHeader,
    type EntityDetail,
    StatCard,
    TabList,
    TabPanel,
    useActionMenu,
    useConfirm,
    useTabs,
    useToast,
} from "@stefgo/react-ui-components";
import { StatusDot } from "./StatusDot";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { ClientContainerList } from "./ClientContainerList";
import { ClientVolumeList } from "./ClientVolumeList";
import { ClientNetworkList } from "./ClientNetworkList";
import { ClientImageList } from "./ClientImageList";
import { REMOVE_ACTIONS } from "../dockerRemove";
import { describeRemove } from "../confirmations";
import { ActivityView } from "../../activity/components/ActivityView";
import { clientContainersActivityFilter } from "../../containers/activityFilter";
import { clientImagesActivityFilter } from "../../images/activityFilter";
import { PAGE_SIZE } from "../../../components/listDefaults";

type Tab = "containers" | "images" | "volumes" | "networks";

const TABS: readonly Tab[] = ["containers", "images", "volumes", "networks"] as const;

interface ClientOverviewProps {
    client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {
    const navigate = useNavigate();
    const { pathname, state } = useLocation();
    // The list is the only surface that opens this page today, and the honest fallback for
    // a directly opened URL -- the same `from` convention the editor reached from here uses.
    const back = (state as { from?: string } | null)?.from ?? "/clients";
    const { fetchDockerState, refreshDockerState, getDockerState } = useDockerStore();

    // In the URL, so a reload and a shared link both land on the tab that was open. Each
    // tab's list keeps its own search parameter, which is why the tab may be switched
    // without touching them.
    const [tab, setTab] = useSearchQueryParam("tab");
    const tabs = useTabs({
        tabs: TABS,
        value: (TABS as readonly string[]).includes(tab) ? tab : "containers",
        onChange: setTab,
    });
    const { show } = useToast();
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const { confirm, alert } = useConfirm();

    const dockerState = getDockerState(client.id);

    // Each tab reads the host's activity about what it lists: the containers tab what
    // happened to a container, the images tab what happened to an image alone.
    const containerActivityFilter = useMemo(() => clientContainersActivityFilter(client.id), [client.id]);
    const imageActivityFilter = useMemo(() => clientImagesActivityFilter(client.id), [client.id]);

    useEffect(() => {
        if (client.id) {
            fetchDockerState(client.id);
        }
    }, [client.id, fetchDockerState]);

    const handleReloadClient = () => {
        refreshDockerState(client.id);
    };

    /** Throws with the server's message when the action is refused. */
    const sendAction = async (action: DockerActionType, target: string): Promise<void> => {
        const res = await apiFetch(`/api/v1/clients/${client.id}/docker/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, target }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Action failed");
        // A toast rather than a line under the tabs: the line sat below a list that may be
        // longer than the screen, and it vanished with a tab switch.
        show({ variant: "success", title: "Action sent", description: `ID: ${data.actionId}` });
    };

    // Every tab hands its actions through here, so this is the one place that asks before
    // something is removed from the host. Everything else goes straight out. A rejected
    // remove keeps its dialog open, next to the button that retries it.
    const handleAction = async (action: DockerActionType, target: string) => {
        if (REMOVE_ACTIONS.has(action)) {
            await confirm({
                ...describeRemove(action, target, dockerState),
                onConfirm: () => sendAction(action, target),
            });
            return;
        }
        try {
            await sendAction(action, target);
        } catch (e: unknown) {
            await alert(describeFailure("The action was refused", e));
        }
    };

    // The client editor is a route of its own and handles its own Escape.
    useEscapeToLeave(back);

    const isOnline = client.status === CLIENT_STATUS.ONLINE;
    const isInbound = client.connectionMode !== CONNECTION_MODE.OUTBOUND;

    /**
     * What the header row has no room for. All of it opens on request, so a closed header
     * is just the row. `null` and `""` are different schedules, so the auto-update entry
     * reads the stored value as it is.
     */
    const details: EntityDetail[] = [
        { label: "ID", value: client.id, copyable: client.id },
        { label: "Agent", value: client.version || "Unknown" },
        // The clock the agent reads every cron expression of its policy on.
        { label: "Time Zone", value: client.timezone || "Unknown" },
        isInbound
            ? { label: "Allowed IP", value: client.inboundAllowedIp || "Any" }
            : { label: "Target Address", value: client.outboundTargetAddress || "–" },
        ...(isInbound && client.inboundLastIp
            ? [{ label: "Last IP", value: client.inboundLastIp }]
            : []),
        { label: "Docker State", value: dockerState ? formatDate(dockerState.updatedAt) : "–" },
        ...(isOnline ? [] : [{ label: "Last Seen", value: formatDate(client.lastSeen) }]),
        {
            label: "Auto-Update",
            value:
                client.autoUpdateCron === null || client.autoUpdateCron === undefined
                    ? "Default schedule"
                    : client.autoUpdateCron === ""
                      ? "Projects only"
                      : client.autoUpdateCron,
        },
    ];

    return (
        <div className="space-y-6">
            <EntityHeader
                leading={<StatusDot online={isOnline} size="md" />}
                title={clientName(client)}
                meta={
                    <>
                        <Badge variant="info">{isInbound ? "Inbound" : "Outbound"}</Badge>
                        {!isOnline && <Badge variant="warning">Offline</Badge>}
                    </>
                }
                details={details}
                // Names the view, not the client: one entry for every client page.
                persist={{ key: "dim.client.details", scope: "local" }}
                actions={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Client actions"
                            onClick={(e) => openMenu(e, client.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === client.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <button
                                onClick={() => {
                                    handleReloadClient();
                                    closeMenu();
                                }}
                                className={MENU_ENTRY}
                            >
                                <RefreshCw size={16} /> Reload Docker
                            </button>
                            <button
                                onClick={() => {
                                    // `from` is how the editor knows that back is this
                                    // page and not the client list.
                                    navigate(`/client/${client.id}/edit`, {
                                        state: { from: pathname },
                                    });
                                    closeMenu();
                                }}
                                className={MENU_ENTRY}
                            >
                                <Edit size={16} /> Edit
                            </button>
                        </ActionMenu>
                    </div>
                }
            />

            {/* An offline client shows its header only: the cached Docker state would read as
                current, and every action on it would go to a host that cannot answer. */}
            {isOnline ? (
                <>
                    {/* The cards are the tab list: `tabProps` is what makes them announce
                        themselves as tabs and puts the arrow keys on the row. */}
                    <TabList tabs={tabs} aria-label="Docker objects" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            {...tabs.tabProps("containers")}
                            label="Containers"
                            value={dockerState ? String(dockerState.containers.length) : "–"}
                            icon={Box}
                        />
                        <StatCard
                            {...tabs.tabProps("images")}
                            label="Images"
                            value={dockerState ? String(dockerState.images.length) : "–"}
                            icon={Layers}
                        />
                        <StatCard
                            {...tabs.tabProps("volumes")}
                            label="Volumes"
                            value={dockerState ? String(dockerState.volumes.length) : "–"}
                            icon={HardDrive}
                        />
                        <StatCard
                            {...tabs.tabProps("networks")}
                            label="Networks"
                            value={dockerState ? String(dockerState.networks.length) : "–"}
                            icon={Network}
                        />
                    </TabList>

                    {!dockerState ? (
                        <LoadingIndicator label="No Docker data yet. Waiting for the first update from the client…" />
                    ) : (
                        <>
                            <TabPanel tabs={tabs} value="containers">
                                <div className="space-y-6">
                                    <ClientContainerList clientId={client.id} containers={dockerState.containers} onAction={handleAction} searchParamKey="search.containers" />
                                    <ActivityView
                                        filter={containerActivityFilter}
                                        searchParamKey="search.containerActivity"
                                        persistKey="clientContainersActivityView"
                                        pageSize={PAGE_SIZE.embedded}
                                    />
                                </div>
                            </TabPanel>
                            <TabPanel tabs={tabs} value="images">
                                <div className="space-y-6">
                                    <ClientImageList clientId={client.id} images={dockerState.images} containers={dockerState.containers} onAction={handleAction} searchParamKey="search.images" />
                                    <ActivityView
                                        filter={imageActivityFilter}
                                        searchParamKey="search.imageActivity"
                                        persistKey="clientImagesActivityView"
                                        pageSize={PAGE_SIZE.embedded}
                                    />
                                </div>
                            </TabPanel>
                            <TabPanel tabs={tabs} value="volumes">
                                <ClientVolumeList volumes={dockerState.volumes} onAction={handleAction} searchParamKey="search.volumes" />
                            </TabPanel>
                            <TabPanel tabs={tabs} value="networks">
                                <ClientNetworkList networks={dockerState.networks} onAction={handleAction} searchParamKey="search.networks" />
                            </TabPanel>
                        </>
                    )}
                </>
            ) : null}
        </div>
    );
};
