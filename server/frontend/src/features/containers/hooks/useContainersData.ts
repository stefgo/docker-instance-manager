import { useMemo, useEffect } from "react";
import { DockerContainer, DockerImage } from "@dim/shared";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import {
  AutoUpdateLabelFilter,
  useAutoUpdateStore,
} from "../../../stores/useAutoUpdateStore";
import { useAuth } from "../../auth/AuthContext";
import { UpdateStatus, aggregateUpdateStatus } from "../../images/hooks/useImagesData";

export type ContainerAggregateState = "running" | "stopped" | "paused" | "mixed";
export type AutoUpdateSource = "label" | "global" | "manual" | "none";
export type AutoUpdateAggregate = "all" | "none" | "mixed";

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
  autoUpdateAggregate: AutoUpdateAggregate;
  hasGlobalEnrollment: boolean;
  hasLabelChild: boolean;
  hasNonLabelChild: boolean;
  children?: ClientNode[];
}

export interface ClientNode {
  id: string;
  nodeType: "client";
  clientName: string;
  clientId: string;
  configImage: string;
  clientIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
  containerId: string;
  containerState: string;
  containerName: string;
  autoUpdateSource: AutoUpdateSource;
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
  containerName: string;
  containerState: string;
  repoDigests: string[];
  updateStatus: UpdateStatus;
  autoUpdateSource: AutoUpdateSource;
}

export function matchesAutoUpdateLabel(
  container: DockerContainer,
  filter: AutoUpdateLabelFilter | null,
): boolean {
  if (!filter) return false;
  const labels = container.labels ?? {};
  if (!(filter.key in labels)) return false;
  if (filter.value === null) return true;
  return labels[filter.key] === filter.value;
}

function aggregateAutoUpdate(sources: AutoUpdateSource[]): AutoUpdateAggregate {
  if (sources.length === 0) return "none";
  const onCount = sources.filter((s) => s !== "none").length;
  if (onCount === 0) return "none";
  if (onCount === sources.length) return "all";
  return "mixed";
}

export function useContainersData(): ContainerNode[] {
  const { token } = useAuth();
  const dockerStates = useDockerStore((s) => s.dockerStates);
  const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
  const clients = useClientStore((s) => s.clients);
  const manualIndex = useAutoUpdateStore((s) => s.manualIndex);
  const labelFilter = useAutoUpdateStore((s) => s.labelFilter);

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

        const isLabelMatch = matchesAutoUpdateLabel(container, labelFilter);
        const isGlobal = !isLabelMatch && manualIndex.global.has(name);
        const isClientManual = !isLabelMatch && !isGlobal && !!(manualIndex.byClient[clientId]?.has(name));
        const autoUpdateSource: AutoUpdateSource = isLabelMatch
          ? "label"
          : isGlobal
            ? "global"
            : isClientManual
              ? "manual"
              : "none";

        entry.clientEntries.push({
          clientId,
          containerId: container.id,
          containerName: name,
          containerState: container.state,
          repoDigests: clientRepoDigests,
          updateStatus,
          autoUpdateSource,
        });
      }
    }

    return Array.from(grouped.entries()).map(([key, { clientEntries, repoDigests, updateStatuses }]) => {
      const [name, configImage] = key.split("||");

      const children: ClientNode[] = clientEntries.map(({ clientId, containerId, containerName, containerState, repoDigests: crd, updateStatus: cus, autoUpdateSource }) => ({
        id: `${key}||${clientId}`,
        nodeType: "client" as const,
        clientName: clientMap.get(clientId) ?? clientId,
        clientId,
        configImage,
        clientIds: [clientId],
        repoDigests: crd,
        updateStatus: cus,
        containerId,
        containerState,
        containerName,
        autoUpdateSource,
      }));

      const sources = clientEntries.map((e) => e.autoUpdateSource);
      const hasGlobalEnrollment = sources.includes("global");
      const hasLabelChild = sources.includes("label");
      const hasNonLabelChild = sources.some((s) => s !== "label");

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
        autoUpdateAggregate: aggregateAutoUpdate(sources),
        hasGlobalEnrollment,
        hasLabelChild,
        hasNonLabelChild,
        children: children.length > 0 ? children : undefined,
      };
    });
  }, [dockerStates, clients, manualIndex, labelFilter]);
}
