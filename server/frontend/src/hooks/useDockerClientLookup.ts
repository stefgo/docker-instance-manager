import { useMemo } from "react";
import { useClientStore } from "../stores/useClientStore";
import { useDockerStore } from "../stores/useDockerStore";

export interface DockerClientLookup {
  /** Maps imageId (normalized sha256:…) → clientId */
  imageClientMap: Map<string, string>;
  /** Maps containerId → clientId */
  containerClientMap: Map<string, string>;
}

export function useDockerClientLookup(): DockerClientLookup {
  const { clients } = useClientStore();
  const { dockerStates } = useDockerStore();

  return useMemo(() => {
    const imageClientMap = new Map<string, string>();
    const containerClientMap = new Map<string, string>();

    for (const client of clients) {
      const state = dockerStates[client.id];
      if (!state) continue;

      for (const image of state.images) {
        const imageId = image.id.startsWith("sha256:") ? image.id : `sha256:${image.id}`;
        if (!imageClientMap.has(imageId)) {
          imageClientMap.set(imageId, client.id);
        }
      }

      for (const container of state.containers) {
        if (!containerClientMap.has(container.id)) {
          containerClientMap.set(container.id, client.id);
        }
      }
    }

    return { imageClientMap, containerClientMap };
  }, [clients, dockerStates]);
}
