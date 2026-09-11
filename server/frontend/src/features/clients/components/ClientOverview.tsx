import { MoreVertical, Edit, RefreshCw, Box, Layers, HardDrive, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/apiFetch";
import { Client, CLIENT_STATUS, DockerActionType, DockerState, UpdateClient } from "@dim/shared";
import { formatDate, getErrorMessage } from "../../../utils";
import { ClientEditor } from "./ClientEditor";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ActionMenu, Card, ConfirmDialog, StatCard, useActionMenu } from "@stefgo/react-ui-components";
import { ClientContainerList } from "./ClientContainerList";
import { ClientVolumeList } from "./ClientVolumeList";
import { ClientNetworkList } from "./ClientNetworkList";
import { ClientImageList } from "./ClientImageList";

type Tab = "containers" | "images" | "volumes" | "networks";

const REMOVE_ACTIONS: ReadonlySet<DockerActionType> = new Set<DockerActionType>([
    "container:remove",
    "image:remove",
    "volume:remove",
    "network:remove",
]);

/**
 * Title and consequence for a remove action. The tabs pass ids, so the name is looked up
 * in the client's Docker state; the id stands in when the entry is already gone. The texts
 * follow what the agent actually does in DockerService: a container is removed with force,
 * the other three without it, which is why Docker refuses them while they are in use.
 */
function describeRemove(
    action: DockerActionType,
    target: string,
    state: DockerState | null,
): { title: string; description: string; confirmLabel: string } {
    switch (action) {
        case "container:remove": {
            const c = state?.containers.find((x) => x.id === target);
            const name = c?.names[0]?.replace(/^\//, "") ?? target;
            return {
                title: `Remove container "${name}"?`,
                description: "The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept.",
                confirmLabel: "Remove container",
            };
        }
        case "image:remove": {
            const img = state?.images.find((x) => x.id === target);
            const name = img?.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : target;
            return {
                title: `Remove image "${name}"?`,
                description: "The image is deleted from this host and has to be pulled again to be used. Docker refuses this while a container still uses the image.",
                confirmLabel: "Remove image",
            };
        }
        case "volume:remove":
            return {
                title: `Remove volume "${target}"?`,
                description: "The volume is deleted from this host together with all data stored in it. This cannot be undone. Docker refuses this while a container still uses the volume.",
                confirmLabel: "Remove volume",
            };
        default: {
            const n = state?.networks.find((x) => x.id === target);
            return {
                title: `Remove network "${n?.name ?? target}"?`,
                description: "The network is deleted from this host. Docker refuses this while containers are still connected to it.",
                confirmLabel: "Remove network",
            };
        }
    }
}

interface ClientOverviewProps {
    client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {
    const { updateClient } = useClientStore();
    const { fetchDockerState, refreshDockerState, getDockerState } = useDockerStore();

    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("containers");
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

    const handleUpdateClient = async (
        id: string,
        data: UpdateClient,
    ) => {
        // Errors propagate to the editor, which shows them next to the form and stays open.
        await updateClient(id, data);
        setIsEditing(false);
    };

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

    if (isEditing) {
        return (
            <ClientEditor
                client={client}
                onSave={handleUpdateClient}
                onCancel={() => setIsEditing(false)}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <Card
                title={
                    <div className="flex items-center gap-4">
                        <div
                            className={`w-3 h-3 rounded-full ${client.status === CLIENT_STATUS.ONLINE ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border"}`}
                        />
                        <div>
                            <h2 className="text-2xl font-bold">
                                {client.displayName || client.hostname}
                            </h2>
                            <div className="text-sm font-mono text-text-muted">
                                {client.id}
                            </div>
                        </div>
                    </div>
                }
                action={
                    <div className="flex items-center gap-4">
                        {dockerState && (
                            <div className="text-right mr-2">
                                <div className="text-xs text-text-muted uppercase tracking-wider font-bold mb-1">
                                    Docker State
                                </div>
                                <div className="text-sm text-text-primary font-mono">
                                    {formatDate(dockerState.updatedAt)}
                                </div>
                            </div>
                        )}
                        {client.status !== CLIENT_STATUS.ONLINE && (
                            <div className="text-right mr-2">
                                <div className="text-xs text-text-muted uppercase tracking-wider font-bold mb-1">
                                    Last Seen
                                </div>
                                <div className="text-sm text-text-primary font-mono">
                                    {formatDate(client.lastSeen)}
                                </div>
                            </div>
                        )}
                        <div className="relative">
                            <button
                                onClick={(e) => openMenu(e, client.id)}
                                className="p-2 hover:bg-hover rounded-full transition-colors text-text-muted"
                            >
                                <MoreVertical size={20} />
                            </button>
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
                                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover flex items-center gap-2"
                                >
                                    <RefreshCw size={16} /> Reload Docker
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditing(true);
                                        closeMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover flex items-center gap-2"
                                >
                                    <Edit size={16} /> Edit Client
                                </button>
                            </ActionMenu>
                        </div>
                    </div>
                }
            />

            {/* Docker State */}
            {client.status === CLIENT_STATUS.ONLINE || dockerState ? (
                <>
                    {/* `selected` draws the ring and tells assistive technology which card is
                        the current tab -- the wrapper divs used to draw only the ring. */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Container"
                            value={dockerState ? String(dockerState.containers.length) : "–"}
                            icon={Box}
                            selected={activeTab === "containers"}
                            onClick={() => setActiveTab("containers")}
                        />
                        <StatCard
                            label="Images"
                            value={dockerState ? String(dockerState.images.length) : "–"}
                            icon={Layers}
                            selected={activeTab === "images"}
                            onClick={() => setActiveTab("images")}
                        />
                        <StatCard
                            label="Volumes"
                            value={dockerState ? String(dockerState.volumes.length) : "–"}
                            icon={HardDrive}
                            selected={activeTab === "volumes"}
                            onClick={() => setActiveTab("volumes")}
                        />
                        <StatCard
                            label="Networks"
                            value={dockerState ? String(dockerState.networks.length) : "–"}
                            icon={Network}
                            selected={activeTab === "networks"}
                            onClick={() => setActiveTab("networks")}
                        />
                    </div>

                    {!dockerState ? (
                        <p className="text-text-muted text-sm py-4 text-center">
                            No Docker data yet. Waiting for the first update from the client…
                        </p>
                    ) : (
                        <>
                            {activeTab === "containers" && (
                                <ClientContainerList clientId={client.id} containers={dockerState.containers} onAction={handleAction} />
                            )}
                            {activeTab === "images" && (
                                <ClientImageList images={dockerState.images} onAction={handleAction} />
                            )}
                            {activeTab === "volumes" && (
                                <ClientVolumeList volumes={dockerState.volumes} onAction={handleAction} />
                            )}
                            {activeTab === "networks" && (
                                <ClientNetworkList networks={dockerState.networks} onAction={handleAction} />
                            )}
                            {actionFeedback && (
                                <p className="text-xs text-green-500 text-center">{actionFeedback}</p>
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
