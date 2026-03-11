import { MoreVertical, Edit } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Client } from "@docker-instance-manager/shared";
import { formatDate, getErrorMessage } from "../../../utils";
import { ClientEditor } from "./ClientEditor";
import { useClientStore } from "../../../stores/useClientStore";
import { ActionMenu } from "@stefgo/react-ui-components";
import { useActionMenu } from "@stefgo/react-ui-components";

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
      {/* Detail View */}
      <div className="space-y-6">
        <div className="premium-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-3 h-3 rounded-full ${client.status === "online" ? "bg-green-500 shadow-glow-online animate-pulse-glow" : "bg-gray-400 dark:bg-app-input"}`}
              />
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-app-text-main">
                  {client.displayName || client.hostname}
                </h2>
                <div className="text-sm font-mono text-gray-500 dark:text-app-text-muted flex items-center gap-2">
                  {client.id}
                </div>
              </div>
            </div>

            {/* Right Side: Menu or Status */}
            <div className="flex items-center gap-4">
              {client.status !== "online" && (
                <div className="text-right mr-2">
                  <div className="text-xs text-app-text-muted uppercase tracking-wider font-bold mb-1">
                    Last Seen
                  </div>
                  <div className="text-sm text-gray-700 dark:text-app-text-main font-mono">
                    {formatDate(client.lastSeen)}
                  </div>
                </div>
              )}

              {/* Kebab Menu */}
              <div className="relative">
                <button
                  onClick={(e) => openMenu(e, client.id)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-app-input rounded-full transition-colors text-app-text-muted"
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
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-app-text-main hover:bg-gray-50 dark:hover:bg-app-input flex items-center gap-2"
                  >
                    <Edit size={16} /> Edit Client
                  </button>
                </ActionMenu>
              </div>
            </div>
          </div>
        </div>
      </div>

      {client.status === "online" && (
        <div className="premium-card p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-app-text-main mb-4">
            Instance Overview
          </h3>
          <p className="text-gray-500 dark:text-app-text-muted">
            No instances found or not yet implemented.
          </p>
        </div>
      )}
    </div>
  );
};
