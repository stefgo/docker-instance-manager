import { useMemo, useEffect } from "react";
import { DockerImage } from "@dim/shared";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import { useAuth } from "../../auth/AuthContext";
import { UpdateStatus, aggregateUpdateStatus } from "../../images/hooks/useImagesData";

export type ContainerAggregateState = "running" | "stopped" | "paused" | "mixed";

export interface ContainerInstance {
  clientId: string;
  containerId: string;
  state: string;
}

export interface ContainerNode {
  id: string;
  nodeType: "container";
  name: string;
  configImage: string;
  clientCount: number;
  clientIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
  instances: ContainerInstance[];
  aggregateState: ContainerAggregateState;
  children?: ClientNode[];
}

export interface ClientNode {
  id: string;
  nodeType: "client";
  clientName: string;
  configImage: string;
  clientIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
  containerId: string;
  containerState: string;
}

export type ContainerTreeNode = ContainerNode | ClientNode;

function imageToUpdateStatus(img: DockerImage | undefined): UpdateStatus {
  if (!img) return "none";
  if (!img.updateCheck) return "unchecked";
  if (img.updateCheck.error) return "unchecked";
  return img.updateCheck.hasUpdate ? "update" : "current";
}

function aggregateContainerState(states: string[]): ContainerAggregateState {
  const unique = new Set(states);
  if (unique.size === 1) {
    const s = states[0];
    if (s === "running") return "running";
    if (s === "paused") return "paused";
    return "stopped";
  }
  return "mixed";
}

interface ClientEntry {
  clientId: string;
  containerId: string;
  containerState: string;
  repoDigests: string[];
  updateStatus: UpdateStatus;
}

export function useContainersData(): ContainerNode[] {
  const { token } = useAuth();
  const dockerStates = useDockerStore((s) => s.dockerStates);
  const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
  const clients = useClientStore((s) => s.clients);

  useEffect(() => {
    if (token) {
      clients.forEach((c) => fetchDockerState(c.id, token));
    }
  }, [token, clients, fetchDockerState]);

  return useMemo(() => {
    const clientMap = new Map(clients.map((c) => [c.id, c.displayName ?? c.hostname]));
    const grouped = new Map<string, {
      clientEntries: ClientEntry[];
      repoDigests: Set<string>;
      updateStatuses: UpdateStatus[];
    }>();

    for (const [clientId, state] of Object.entries(dockerStates)) {
      for (const container of state.containers) {
        const name = container.names[0]?.replace(/^\//, "") ?? container.id;
        const configImage = container.configImage ?? "";
        const lastSlash = configImage.lastIndexOf("/");
        const namePart = configImage.slice(lastSlash + 1);
        const normalizedConfigImage = configImage !== "" && !namePart.includes(":") && !configImage.includes("@")
          ? `${configImage}:latest`
          : configImage;
        const key = `${name}||${normalizedConfigImage}`;

        let entry = grouped.get(key);
        if (!entry) {
          entry = { clientEntries: [], repoDigests: new Set(), updateStatuses: [] };
          grouped.set(key, entry);
        }

        const img = state.images.find((i) => i.repoTags.includes(normalizedConfigImage));
        const clientRepoDigests: string[] = [];
        if (img) {
          for (const rd of img.repoDigests) {
            entry.repoDigests.add(rd);
            clientRepoDigests.push(rd);
          }
        }
        const updateStatus = imageToUpdateStatus(img);
        entry.updateStatuses.push(updateStatus);
        entry.clientEntries.push({
          clientId,
          containerId: container.id,
          containerState: container.state,
          repoDigests: clientRepoDigests,
          updateStatus,
        });
      }
    }

    return Array.from(grouped.entries()).map(([key, { clientEntries, repoDigests, updateStatuses }]) => {
      const [name, configImage] = key.split("||");

      const children: ClientNode[] = clientEntries.map(({ clientId, containerId, containerState, repoDigests: crd, updateStatus: cus }) => ({
        id: `${key}||${clientId}`,
        nodeType: "client" as const,
        clientName: clientMap.get(clientId) ?? clientId,
        configImage,
        clientIds: [clientId],
        repoDigests: crd,
        updateStatus: cus,
        containerId,
        containerState,
      }));

      return {
        id: key,
        nodeType: "container" as const,
        name,
        configImage,
        clientCount: clientEntries.length,
        clientIds: clientEntries.map((e) => e.clientId),
        repoDigests: Array.from(repoDigests),
        updateStatus: aggregateUpdateStatus(updateStatuses),
        instances: clientEntries.map(({ clientId, containerId, containerState }) => ({ clientId, containerId, state: containerState })),
        aggregateState: aggregateContainerState(clientEntries.map((e) => e.containerState)),
        children: children.length > 0 ? children : undefined,
      };
    });
  }, [dockerStates, clients]);
}
