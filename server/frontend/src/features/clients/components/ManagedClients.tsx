import { Client } from "@dim/shared";
import { ClientList } from "./ClientList";
import { ClientEditor } from "./ClientEditor";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { TokenModal } from "../../tokens/components/TokenModal";

interface ManagedClientsProps {
  clients: Client[];
  onSelect: (client: Client | null) => void;
  onRefresh: () => void;
  onDelete: (clientId: string) => void;
  onUpdate: (clientId: string, data: { displayName?: string }) => Promise<void>;
}

export const ManagedClients = ({
  clients,
  onSelect,
  onRefresh,
  onDelete,
  onUpdate,
}: ManagedClientsProps) => {
  const { token } = useAuth();
  const [createdToken, setCreatedToken] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

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

  const handleSaveClient = async (
    id: string,
    data: { displayName?: string },
  ) => {
    await onUpdate(id, data);
    setEditingClient(null);
  };

  return (
    <div id="client-list-section">
      {editingClient ? (
        <ClientEditor
          client={editingClient}
          onSave={handleSaveClient}
          onCancel={() => setEditingClient(null)}
        />
      ) : (
        <ClientList
          clients={clients}
          setSelectedClient={onSelect}
          deleteClient={handleDeleteClient}
          generateToken={handleGenerateToken}
          editClient={setEditingClient}
        />
      )}

      {/* Token Modal */}
      {isTokenModalOpen && createdToken && (
        <TokenModal
          token={createdToken.token}
          expiresAt={createdToken.expiresAt}
          onClose={() => setIsTokenModalOpen(false)}
        />
      )}
    </div>
  );
};
