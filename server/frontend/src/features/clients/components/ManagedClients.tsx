import { Plus, Edit, Trash2, RefreshCw } from "lucide-react";
import { Client, CLIENT_STATUS, CONNECTION_MODE, UpdateClient } from "@dim/shared";
import { ClientList } from "./ClientList";
import { ClientEditor } from "./ClientEditor";
import { ClientConnectModal } from "./ClientConnectModal";
import { useState } from "react";
import { apiFetch } from "../../../lib/apiFetch";
import { useDockerStore } from "../../../stores/useDockerStore";
import { TokenModal } from "../../tokens/components/TokenModal";
import { DataAction } from "@stefgo/react-ui-components";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { getErrorMessage } from "../../../utils";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    /** Resolves once the client is gone, so the dialog can hold its spinner until then. */
    onDelete: (clientId: string) => Promise<void>;
    onUpdate: (clientId: string, data: UpdateClient) => Promise<void>;
    onCreateOutbound: (data: { hostname: string; outboundTargetAddress: string; registrationSecret: string }) => Promise<void>;
}

export const ManagedClients = ({
    clients,
    onSelect,
    onRefresh,
    onDelete,
    onUpdate,
    onCreateOutbound,
}: ManagedClientsProps) => {
    const { refreshDockerState } = useDockerStore();
    const [createdToken, setCreatedToken] = useState<{
        token: string;
        expiresAt: string;
    } | null>(null);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [isClientConnectModalOpen, setIsClientConnectModalOpen] = useState(false);

    const handleGenerateToken = async () => {
        try {
            const res = await apiFetch("/api/v1/tokens", {
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                setCreatedToken(data);
                setIsTokenModalOpen(true);
                onRefresh();
            }
        } catch (e) {
            console.error(e);
        }
    };

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

    const handleReloadClient = async (client: Client) => {

        if (client.connectionMode === CONNECTION_MODE.OUTBOUND && client.status === CLIENT_STATUS.OFFLINE) {
            await apiFetch(`/api/v1/clients/${client.id}/reconnect`, {
                method: "POST",
            });
            return;
        }

        refreshDockerState(client.id);
    };

    const handleSaveClient = async (id: string, data: UpdateClient) => {
        await onUpdate(id, data);
        setEditingClient(null);
    };

    const handleCreateOutbound = async (data: {
        hostname: string;
        outboundTargetAddress: string;
        registrationSecret: string;
    }) => {
        await onCreateOutbound(data);
        setIsClientConnectModalOpen(false);
    };

    if (editingClient) {
        return (
            <ClientEditor
                client={editingClient}
                onSave={handleSaveClient}
                onCancel={() => setEditingClient(null)}
            />
        );
    }

    return (
        <div id="client-list-section">
            <ClientList
                clients={clients}
                setSelectedClient={onSelect}
                renderRowActions={(client) => (
                    <DataAction
                        rowId={client.id}
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
                                onClick: () => setEditingClient(client),
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
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsClientConnectModalOpen(true)}
                            className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-secondary-hover flex items-center gap-1"
                            title="Add client in outbound mode (server connects to client)"
                        >
                            <Plus size={12} />
                            Add Outbound Client
                        </button>
                        <button
                            onClick={handleGenerateToken}
                            className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover flex items-center gap-1"
                        >
                            <Plus size={12} />
                            Generate New Token
                        </button>
                    </div>
                }
            />

            {isTokenModalOpen && createdToken && (
                <TokenModal
                    token={createdToken.token}
                    expiresAt={createdToken.expiresAt}
                    onClose={() => setIsTokenModalOpen(false)}
                />
            )}

            {isClientConnectModalOpen && (
                <ClientConnectModal
                    onSave={handleCreateOutbound}
                    onCancel={() => setIsClientConnectModalOpen(false)}
                />
            )}

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
