import { MoreVertical, Edit, RefreshCw, Box, Layers, HardDrive, Network } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../../lib/apiFetch";
import { Client, CLIENT_STATUS, CONNECTION_MODE, DockerActionType } from "@dim/shared";
import { formatDate, getErrorMessage } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useDockerStore } from "../../../stores/useDockerStore";
import {
    ActionButton,
    ActionMenu,
    Badge,
    cn,
    ConfirmDialog,
    EntityHeader,
    type EntityDetail,
    FOCUS_RING_NONE,
    StatCard,
    TabList,
    TabPanel,
    useActionMenu,
    useTabs,
} from "@stefgo/react-ui-components";
import { StatusDot } from "./StatusDot";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { ClientContainerList } from "./ClientContainerList";
import { ClientVolumeList } from "./ClientVolumeList";
import { ClientNetworkList } from "./ClientNetworkList";
import { ClientImageList } from "./ClientImageList";
import { describeRemove, REMOVE_ACTIONS } from "../dockerRemove";

type Tab = "containers" | "images" | "volumes" | "networks";

const TABS: readonly Tab[] = ["containers", "images", "volumes", "networks"] as const;

/**
 * A menu entry marks focus with its background, the way the menu's own entries do -- a ring
 * inside the popover would be clipped by it. Shared by the entries below so they cannot drift.
 */
const MENU_ENTRY = cn(
    "w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover focus-visible:bg-hover flex items-center gap-2",
    FOCUS_RING_NONE,
);

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
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const [pendingRemove, setPendingRemove] = useState<{
        action: DockerActionType;
        target: string;
    } | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const dockerState = getDockerState(client.id);

    useEffect(() => {
        if (client.id) {
            fetchDockerState(client.id);
        }
    }, [client.id, fetchDockerState]);

    const handleReloadClient = () => {
        refreshDockerState(client.id);
    };

    /** Returns whether the server accepted the action. */
    const sendAction = async (action: DockerActionType, target: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/v1/clients/${client.id}/docker/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, target }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Action failed");
            setActionFeedback(`Action send (ID: ${data.actionId})`);
            setTimeout(() => setActionFeedback(null), 4000);
            return true;
        } catch (e: unknown) {
            alert(getErrorMessage(e));
            return false;
        }
    };

    // Every tab hands its actions through here, so this is the one place that asks before
    // something is removed from the host. Everything else goes straight out.
    const handleAction = async (action: DockerActionType, target: string) => {
        if (REMOVE_ACTIONS.has(action)) {
            setPendingRemove({ action, target });
            return;
        }
        await sendAction(action, target);
    };

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setIsRemoving(true);
        try {
            // A rejected action keeps the dialog open, next to the button that retries it.
            if (await sendAction(pendingRemove.action, pendingRemove.target)) {
                setPendingRemove(null);
            }
        } finally {
            setIsRemoving(false);
        }
    };

    const removeDialog = pendingRemove
        ? describeRemove(pendingRemove.action, pendingRemove.target, dockerState)
        : null;

    /**
     * Escape does what the closest close control does. The remove dialog is stepped out of
     * first -- it handles its own Escape and stops the event there -- and only the bare
     * overview leaves for the list. The client editor is a route of its own and handles its
     * own Escape.
     */
    const requestClose = useCallback(() => {
        navigate(back);
    }, [navigate, back]);

    // Not while a select, a dialog or an autocomplete is using Escape for itself.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            requestClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [requestClose]);

    const isOnline = client.status === CLIENT_STATUS.ONLINE;
    const isInbound = client.connectionMode !== CONNECTION_MODE.OUTBOUND;

    /**
     * What the header row has no room for. Freshness stays in view -- whether the lists
     * below can be trusted is the first question on this page -- and the configuration the
     * editor owns opens on request. `null` and `""` are different schedules, so the
     * auto-update entry reads the stored value as it is.
     */
    const details: EntityDetail[] = [
        { label: "Agent", value: client.version || "Unknown", visibility: "always" },
        {
            label: "Docker State",
            value: dockerState ? formatDate(dockerState.updatedAt) : "–",
            visibility: "always",
        },
        ...(isOnline
            ? []
            : [{ label: "Last Seen", value: formatDate(client.lastSeen), visibility: "always" as const }]),
        { label: "ID", value: client.id, mono: true, copyable: client.id },
        isInbound
            ? { label: "Allowed IP", value: client.inboundAllowedIp || "Any", mono: !!client.inboundAllowedIp }
            : { label: "Target Address", value: client.outboundTargetAddress || "–", mono: true },
        ...(isInbound && client.inboundLastIp
            ? [{ label: "Last IP", value: client.inboundLastIp, mono: true }]
            : []),
        {
            label: "Auto-Update",
            value:
                client.autoUpdateCron === null || client.autoUpdateCron === undefined
                    ? "Default schedule"
                    : client.autoUpdateCron === ""
                      ? "Projects only"
                      : client.autoUpdateCron,
            mono: !!client.autoUpdateCron,
        },
    ];

    return (
        <div className="space-y-6">
            <EntityHeader
                leading={<StatusDot online={isOnline} size="md" />}
                title={client.displayName || client.hostname}
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
                                <Edit size={16} /> Edit Client
                            </button>
                        </ActionMenu>
                    </div>
                }
            />

            {/* Docker State */}
            {client.status === CLIENT_STATUS.ONLINE || dockerState ? (
                <>
                    {/* The cards are the tab list: `tabProps` is what makes them announce
                        themselves as tabs and puts the arrow keys on the row. */}
                    <TabList tabs={tabs} aria-label="Docker objects" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            {...tabs.tabProps("containers")}
                            label="Container"
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
                                <ClientContainerList clientId={client.id} containers={dockerState.containers} onAction={handleAction} searchParamKey="search.containers" />
                            </TabPanel>
                            <TabPanel tabs={tabs} value="images">
                                <ClientImageList images={dockerState.images} onAction={handleAction} searchParamKey="search.images" />
                            </TabPanel>
                            <TabPanel tabs={tabs} value="volumes">
                                <ClientVolumeList volumes={dockerState.volumes} onAction={handleAction} searchParamKey="search.volumes" />
                            </TabPanel>
                            <TabPanel tabs={tabs} value="networks">
                                <ClientNetworkList networks={dockerState.networks} onAction={handleAction} searchParamKey="search.networks" />
                            </TabPanel>
                            {actionFeedback && (
                                <p className="text-xs text-success text-center">{actionFeedback}</p>
                            )}
                        </>
                    )}
                </>
            ) : null}

            <ConfirmDialog
                isOpen={!!pendingRemove}
                onClose={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
                title={removeDialog?.title ?? ""}
                description={removeDialog?.description}
                confirmLabel={removeDialog?.confirmLabel}
                variant="danger"
                isConfirming={isRemoving}
            />
        </div>
    );
};
