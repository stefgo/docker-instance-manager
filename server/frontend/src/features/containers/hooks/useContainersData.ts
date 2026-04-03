import { useMemo, useEffect } from "react";
import { DockerImage } from "@dim/shared";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import { useAuth } from "../../auth/AuthContext";
import { UpdateStatus, aggregateUpdateStatus } from "../../images/hooks/useImagesData";

export interface ContainerRow {
  id: string;
  name: string;
  configImage: string;
  clientCount: number;
  clientNames: string[];
  clientIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
}

function imageToUpdateStatus(img: DockerImage | undefined): UpdateStatus {
  if (!img) return "none";
  if (!img.updateCheck) return "unchecked";
  if (img.updateCheck.error) return "unchecked";
  return img.updateCheck.hasUpdate ? "update" : "current";
}

export function useContainersData(): ContainerRow[] {
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
      clientIds: Set<string>;
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
          entry = { clientIds: new Set(), repoDigests: new Set(), updateStatuses: [] };
          grouped.set(key, entry);
        }
        entry.clientIds.add(clientId);

        const img = state.images.find((i) => i.repoTags.includes(normalizedConfigImage));
        if (img) {
          for (const rd of img.repoDigests) entry.repoDigests.add(rd);
        }
        entry.updateStatuses.push(imageToUpdateStatus(img));
      }
    }

    return Array.from(grouped.entries()).map(([key, { clientIds, repoDigests, updateStatuses }]) => {
      const [name, configImage] = key.split("||");
      return {
        id: key,
        name,
        configImage,
        clientCount: clientIds.size,
        clientNames: Array.from(clientIds).map((id) => clientMap.get(id) ?? id),
        clientIds: Array.from(clientIds),
        repoDigests: Array.from(repoDigests),
        updateStatus: aggregateUpdateStatus(updateStatuses),
      };
    });
  }, [dockerStates, clients]);
}
