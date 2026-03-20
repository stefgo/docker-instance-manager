import { MoreVertical, Edit } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Client } from "@dim/shared";
import { formatDate, getErrorMessage } from "../../../utils";
import { ClientEditor } from "./ClientEditor";
import { useClientStore } from "../../../stores/useClientStore";
import { ActionMenu, Card, useActionMenu } from "@stefgo/react-ui-components";

interface ClientOverviewProps {
  client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {
  const { token } = useAuth();
  const { updateClient } = useClientStore();

  const [isEditing, setIsEditing] = useState(false);
  const { menuState, openMenu, closeMenu } = useActionMenu<string>();

  const handleUpdateClient = async (
    id: string,
    data: { displayName?: string },
  ) => {
    if (!token) return;
    try {
      await updateClient(id, data, token);
      setIsEditing(false);
    } catch (e: unknown) {
      console.error("Failed to update client", e);
      alert(getErrorMessage(e));
    }
  };

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
      <Card
        title={
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-border dark:bg-border-dark"}`}
            />
            <div>
              <h2 className="text-2xl font-bold">
                {client.displayName || client.hostname}
              </h2>
              <div className="text-sm font-mono text-text-muted dark:text-text-muted-dark">
                {client.id}
              </div>
            </div>
          </div>
        }
        action={
          <div className="flex items-center gap-4">
            {client.status !== "online" && (
              <div className="text-right mr-2">
                <div className="text-xs text-text-muted dark:text-text-muted-dark uppercase tracking-wider font-bold mb-1">
                  Last Seen
                </div>
                <div className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                  {formatDate(client.lastSeen)}
                </div>
              </div>
            )}
            <div className="relative">
              <button
                onClick={(e) => openMenu(e, client.id)}
                className="p-2 hover:bg-hover dark:hover:bg-hover-dark rounded-full transition-colors text-text-muted dark:text-text-muted-dark"
              >
                <MoreVertical size={20} />
              </button>
              <ActionMenu
                isOpen={menuState?.id === client.id}
                onClose={closeMenu}
                position={menuState || { x: 0, y: 0 }}
              >
                <button
                  onClick={() => {
                    setIsEditing(true);
                    closeMenu();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-text-primary dark:text-text-primary-dark hover:bg-hover dark:hover:bg-hover-dark flex items-center gap-2"
                >
                  <Edit size={16} /> Edit Client
                </button>
              </ActionMenu>
            </div>
          </div>
        }
      />

      {client.status === "online" && (
        <Card title="Instance Overview">
          <div className="p-6">
            <p className="text-text-muted dark:text-text-muted-dark">
              No instances found or not yet implemented.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};
