import { useEffect, useMemo } from "react";
import { useClientStore } from "../stores/useClientStore";
import { useDockerStore } from "../stores/useDockerStore";
import { useAuth } from "../features/auth/AuthContext";
import { AggregatedImage } from "../features/docker/imageTypes";

export function useAggregatedImages(): AggregatedImage[] {
  const { token } = useAuth();
  const { clients } = useClientStore();
  const { dockerStates, fetchDockerState } = useDockerStore();

  useEffect(() => {
    if (token) {
      clients.forEach((c) => fetchDockerState(c.id, token));
    }
  }, [token, clients, fetchDockerState]);

  return useMemo(() => {
    const imageMap = new Map<string, AggregatedImage>();

    for (const client of clients) {
      const dockerState = dockerStates[client.id];
      if (!dockerState) continue;

      const clientName = client.displayName || client.hostname;

      for (const image of dockerState.images) {
        if (!imageMap.has(image.id)) {
          imageMap.set(image.id, {
            id: image.id,
            name: image.repoTags[0] ?? image.repoDigests[0]?.split("@")[0] ?? "<none>",
            repoTags: image.repoTags,
            repoDigests: image.repoDigests,
            size: image.size,
            clientUsages: [],
            updateCheck: image.updateCheck,
          });
        }

        const entry = imageMap.get(image.id)!;
        const containers = dockerState.containers.filter(
          (c) => c.imageId === image.id || image.repoTags.includes(c.image)
        );

        entry.clientUsages.push({ clientId: client.id, clientName, containers });
      }
    }

    return Array.from(imageMap.values()).sort((a, b) => b.size - a.size);
  }, [clients, dockerStates]);
}
