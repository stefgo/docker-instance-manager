import { useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Play } from "lucide-react";
import {
    AGENT_CAPABILITIES,
    agentCan,
    Client,
    CLIENT_STATUS,
    CONNECTION_MODE,
} from "@dim/shared";
import { ClientList } from "./ClientList";
import { apiFetch } from "../../../lib/apiFetch";
import { useDockerStore } from "../../../stores/useDockerStore";
import { Button, ConfirmDialog, DataAction, useToast } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../../../utils";
import { markAutoUpdateRunAsked } from "../../containers/hooks/useAutoUpdateRunToasts";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    /** Resolves once the client is gone, so the dialog can hold its spinner until then. */
    onDelete: (clientId: string) => Promise<void>;
    /** Opens the add wizard -- its own route, so the URL says what is on screen. */
    onAdd: () => void;
    /** Opens the client editor for this client. */
    onEdit: (client: Client) => void;
}

/**
 * The client list and the one thing only the list can do: delete a client.
 *
 * Everything that opens a form -- add and edit -- is a route of its own and therefore a
 * navigation, not a state flag here. This component used to swap both surfaces in and out
 * of the same `div`, which meant the URL described neither of them and a reload dropped the
 * operator back on the list.
 */
export const ManagedClients = ({
    clients,
    onSelect,
    onRefresh,
    onDelete,
    onAdd,
    onEdit,
}: ManagedClientsProps) => {
    const { refreshDockerState } = useDockerStore();
    const { show } = useToast();

    // The client itself, not a boolean: one dialog serves every row, and its text names
    // the host it is about.
    const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await onDelete(pendingDelete.id);
            setPendingDelete(null);
        } catch (e: unknown) {
            // The store reverts its optimistic removal, so the row comes back. The dialog
            // stays open with it -- closing it would hide both the failure and the button
            // that retries it.
            alert(getErrorMessage(e));
        } finally {
            setIsDeleting(false);
        }
    };

    /**
     * Reload means two different things depending on which side dials: an offline outbound
     * client needs a connection attempt before there is anything to read, everything else
     * just needs its Docker state fetched again.
     */
    const handleReloadClient = async (client: Client) => {
        if (
            client.connectionMode === CONNECTION_MODE.OUTBOUND &&
            client.status === CLIENT_STATUS.OFFLINE
        ) {
            await apiFetch(`/api/v1/clients/${client.id}/reconnect`, {
                method: "POST",
            });
            onRefresh();
            return;
        }

        refreshDockerState(client.id);
    };

    /**
     * Ask one agent to run its auto-update now.
     *
     * The run belongs to the host, so the request answers one question only: whether the
     * agent was asked. What it then did arrives later as its own `autoupdate.run` event, and
     * `useAutoUpdateRunToasts` in the shell speaks for it -- there, not here, because the
     * answer takes minutes and must still find the operator on another page.
     */
    const handleRunAutoUpdate = async (client: Client) => {
        const name = client.displayName || client.hostname;
        try {
            const response = await apiFetch(`/api/v1/clients/${client.id}/auto-update/run`, {
                method: "POST",
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(data.error ?? "Failed to ask the agent to run");

            markAutoUpdateRunAsked(client.id, name, (host) =>
                show({
                    variant: "warning",
                    title: `${host} has not reported its run`,
                    description:
                        "The agent was asked, but nothing came back. Whatever it reports later shows up in the client list and the activity.",
                }),
            );

            show({
                variant: "info",
                title: `${name} was asked to run its auto-update`,
                description: "The host runs it on its own and reports back when it is done.",
            });
        } catch (e: unknown) {
            show({ variant: "error", title: `${name}: ${getErrorMessage(e)}`, duration: 0 });
        }
    };

    /**
     * An offline client reports `capabilities == null`, which is "not known", not "cannot":
     * only a reported list that leaves auto-update out means the agent is too old to run it.
     */
    const autoUpdateBlocker = (client: Client): string | null => {
        if (client.status !== CLIENT_STATUS.ONLINE) return "The client is offline.";
        if (
            client.capabilities != null &&
            !agentCan(client.capabilities, AGENT_CAPABILITIES.AUTO_UPDATE)
        ) {
            return "The agent is too old for auto-update — update the agent.";
        }
        return null;
    };

    return (
        <div id="client-list-section">
            <ClientList
                clients={clients}
                setSelectedClient={onSelect}
                renderRowActions={(client) => (
                    <DataAction
                        rowId={client.id}
                        actions={[
                            {
                                icon: Play,
                                onClick: () => void handleRunAutoUpdate(client),
                                color: "blue",
                                disabled: autoUpdateBlocker(client) !== null,
                                tooltip: {
                                    enabled: "Run Auto-Update",
                                    disabled:
                                        autoUpdateBlocker(client) ?? "Run Auto-Update",
                                },
                            },
                        ]}
                        menuEntries={[
                            {
                                label: "Reload",
                                icon: RefreshCw,
                                onClick: () => handleReloadClient(client),
                                variant: "default",
                            },
                            {
                                label: "Edit",
                                icon: Edit,
                                onClick: () => onEdit(client),
                                variant: "default",
                            },
                            {
                                label: "Delete",
                                icon: Trash2,
                                onClick: () => setPendingDelete(client),
                                variant: "danger",
                            },
                        ]}
                    />
                )}
                extraActions={
                    <Button size="sm" icon={Plus} onClick={onAdd}>
                        Add Client
                    </Button>
                }
            />

            {/*
              * What goes with the row is the server's side only: the cached Docker state
              * references clients(id) ON DELETE CASCADE. Nothing on the host changes, and
              * the agent keeps running with credentials the server no longer accepts --
              * the part an operator does not expect, and so the part spelled out.
              */}
            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                title={`Delete "${pendingDelete?.displayName || pendingDelete?.hostname}"?`}
                description={
                    (pendingDelete?.connectionMode === CONNECTION_MODE.OUTBOUND
                        ? "The server stops connecting to this host and forgets it, together with its cached Docker state."
                        : "The server forgets this host, together with its cached Docker state, and refuses its agent from now on.") +
                    " Containers, images and volumes on the host are not touched. To manage the host again, its agent has to be registered anew."
                }
                confirmLabel="Delete client"
                variant="danger"
                isConfirming={isDeleting}
            />
        </div>
    );
};
