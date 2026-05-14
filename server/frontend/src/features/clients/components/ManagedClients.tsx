import { Plus, Edit, Trash2, RefreshCw } from "lucide-react";
import { Client } from "@dim/shared";
import { ClientList } from "./ClientList";
import { ClientEditor } from "./ClientEditor";
import { ClientConnectModal } from "./ClientConnectModal";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useDockerStore } from "../../../stores/useDockerStore";
import { TokenModal } from "../../tokens/components/TokenModal";
import { DataAction } from "@stefgo/react-ui-components";

interface ManagedClientsProps {
  clients: Client[];
  onSelect: (client: Client | null) => void;
  onRefresh: () => void;
  onDelete: (clientId: string) => void;
  onUpdate: (clientId: string, data: { displayName?: string }) => Promise<void>;
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
  const { token } = useAuth();
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
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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

  const handleDeleteClient = async (client: Client) => {
    if (!confirm("Delete this client?")) return;
    onDelete(client.id);
  };

  const handleReloadClient = (client: Client) => {
    if (token) refreshDockerState(client.id, token);
  };

  const handleSaveClient = async (id: string, data: { displayName?: string }) => {
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
                label: "Edit Client",
                icon: Edit,
                onClick: () => setEditingClient(client),
                variant: "default",
              },
              {
                label: "Delete Client",
                icon: Trash2,
                onClick: () => handleDeleteClient(client),
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
    </div>
  );
};
