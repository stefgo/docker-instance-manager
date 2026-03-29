import { MoreVertical, Edit, RefreshCw, Box, Layers, HardDrive, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Client, DockerActionType } from "@dim/shared";
import { formatDate, getErrorMessage } from "../../../utils";
import { ClientEditor } from "./ClientEditor";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ActionMenu, Card, StatCard, useActionMenu } from "@stefgo/react-ui-components";
import { ContainerList } from "../../docker/components/ContainerList";
import { VolumeList } from "../../docker/components/VolumeList";
import { NetworkList } from "../../docker/components/NetworkList";
import { ImageList } from "../../docker/components/ImageList";

type Tab = "containers" | "images" | "volumes" | "networks";

interface ClientOverviewProps {
  client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {
  const { token } = useAuth();
  const { updateClient } = useClientStore();
  const { fetchDockerState, getDockerState } = useDockerStore();

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("containers");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const { menuState, openMenu, closeMenu } = useActionMenu<string>();

  const dockerState = getDockerState(client.id);

  useEffect(() => {
    if (token && client.id) {
      fetchDockerState(client.id, token);
    }
  }, [client.id, token, fetchDockerState]);

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

  const handleAction = async (action: DockerActionType, target: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/clients/${client.id}/docker/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setActionFeedback(`Action send (ID: ${data.actionId})`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (e: unknown) {
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
      {/* Header Card */}
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
            {dockerState && (
              <div className="text-right mr-2">
                <div className="text-xs text-text-muted dark:text-text-muted-dark uppercase tracking-wider font-bold mb-1">
                  Docker Stand
                </div>
                <div className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                  {formatDate(dockerState.updatedAt)}
                </div>
              </div>
            )}
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
                {token && (
                  <button
                    onClick={() => {
                      fetchDockerState(client.id, token);
                      closeMenu();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-text-primary dark:text-text-primary-dark hover:bg-hover dark:hover:bg-hover-dark flex items-center gap-2"
                  >
                    <RefreshCw size={16} /> Refresh Docker State
                  </button>
                )}
              </ActionMenu>
            </div>
          </div>
        }
      />

      {/* Docker State */}
      {client.status === "online" || dockerState ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={activeTab === 'containers' ? 'ring-2 ring-primary rounded-xl h-full' : 'h-full'}>
              <StatCard
                label="Container"
                value={dockerState ? String(dockerState.containers.length) : "–"}
                icon={<Box size={20} />}
                onClick={() => setActiveTab("containers")}
              />
            </div>
            <div className={activeTab === 'images' ? 'ring-2 ring-primary rounded-xl h-full' : 'h-full'}>
              <StatCard
                  label="Images"
                  value={dockerState ? String(dockerState.images.length) : "–"}
                  icon={<Layers size={20} />}
                  onClick={() => setActiveTab("images")}
              />
            </div>
            <div className={activeTab === 'volumes' ? 'ring-2 ring-primary rounded-xl h-full' : 'h-full'}>
              <StatCard
                label="Volumes"
                value={dockerState ? String(dockerState.volumes.length) : "–"}
                icon={<HardDrive size={20} />}
                onClick={() => setActiveTab("volumes")}
                classNames={{ root: activeTab === "volumes" ? "border-primary dark:border-primary" : "" }}
              />
            </div>
            <div className={activeTab === 'networks' ? 'ring-2 ring-primary rounded-xl h-full' : 'h-full'}>
              <StatCard
                label="Networks"
                value={dockerState ? String(dockerState.networks.length) : "–"}
                icon={<Network size={20} />}
                onClick={() => setActiveTab("networks")}
              />
            </div>
          </div>

          {!dockerState ? (
            <p className="text-text-muted dark:text-text-muted-dark text-sm py-4 text-center">
              Keine Docker-Daten verfügbar. Warte auf ersten Update vom Client…
            </p>
          ) : (
            <>
              {activeTab === "containers" && (
                <ContainerList containers={dockerState.containers} onAction={handleAction} />
              )}
              {activeTab === "images" && (
                <ImageList images={dockerState.images} onAction={handleAction} />
              )}
              {activeTab === "volumes" && (
                <VolumeList volumes={dockerState.volumes} onAction={handleAction} />
              )}
              {activeTab === "networks" && (
                <NetworkList networks={dockerState.networks} onAction={handleAction} />
              )}
              {actionFeedback && (
                <p className="text-xs text-green-500 text-center">{actionFeedback}</p>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
};
