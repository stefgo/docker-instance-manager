import { useEffect, useMemo } from "react";
import { useClientStore } from "../../stores/useClientStore";
import { useDockerStore } from "../../stores/useDockerStore";
import { useAuth } from "../auth/AuthContext";
import { ImageGroup } from "./images2Types";

export function useImages2Data(): ImageGroup[] {
  const { token } = useAuth();
  const { clients } = useClientStore();
  const { dockerStates, fetchDockerState } = useDockerStore();

  useEffect(() => {
    if (token) {
      clients.forEach((c) => fetchDockerState(c.id, token));
    }
  }, [token, clients, fetchDockerState]);

  return useMemo(() => {
    // Key: "repository:tag"
    const groupMap = new Map<
      string,
      { imageIds: Set<string>; clientIds: Set<string>; containerCount: number }
    >();

    for (const client of clients) {
      const dockerState = dockerStates[client.id];
      if (!dockerState) continue;

      for (const image of dockerState.images) {
        const tags = image.repoTags.length > 0 ? image.repoTags : ["<none>:<none>"];

        for (const repoTag of tags) {
          const colonIdx = repoTag.lastIndexOf(":");
          const repository = colonIdx !== -1 ? repoTag.slice(0, colonIdx) : repoTag;
          const tag = colonIdx !== -1 ? repoTag.slice(colonIdx + 1) : "";
          const groupKey = `${repository}:${tag}`;

          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
              imageIds: new Set(),
              clientIds: new Set(),
              containerCount: 0,
            });
          }

          const entry = groupMap.get(groupKey)!;
          entry.imageIds.add(image.id);
          entry.clientIds.add(client.id);

          const containers = dockerState.containers.filter(
            (c) => c.imageId === image.id || image.repoTags.includes(c.image),
          );
          entry.containerCount += containers.length;
        }
      }
    }

    return Array.from(groupMap.entries())
      .map(([groupKey, data]) => {
        const colonIdx = groupKey.lastIndexOf(":");
        const repository = colonIdx !== -1 ? groupKey.slice(0, colonIdx) : groupKey;
        const tag = colonIdx !== -1 ? groupKey.slice(colonIdx + 1) : "";
        return {
          id: groupKey,
          repository,
          tag,
          imageCount: data.imageIds.size,
          clientCount: data.clientIds.size,
          containerCount: data.containerCount,
        };
      })
      .sort((a, b) => {
        const repoCompare = a.repository.localeCompare(b.repository);
        if (repoCompare !== 0) return repoCompare;
        return a.tag.localeCompare(b.tag);
      });
  }, [clients, dockerStates]);
}
