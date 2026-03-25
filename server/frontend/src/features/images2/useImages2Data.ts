import { useEffect, useMemo } from "react";
import { useClientStore } from "../../stores/useClientStore";
import { useDockerStore } from "../../stores/useDockerStore";
import { useAuth } from "../auth/AuthContext";
import { ImageTreeNode } from "./images2Types";

export function useImages2Data(): ImageTreeNode[] {
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
    const repositoryMap = new Map<
      string,
      {
        clientIds: Set<string>;
        containerCount: number;
        digestMap: Map<string, { clientIds: Set<string>; containerCount: number }>;
      }
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
          const repositoryKey = `${repository}:${tag}`;

          if (!repositoryMap.has(repositoryKey)) {
            repositoryMap.set(repositoryKey, {
              clientIds: new Set(),
              containerCount: 0,
              digestMap: new Map(),
            });
          }

          const entry = repositoryMap.get(repositoryKey)!;
          const digestFull = image.repoDigests.find((d) => d.startsWith(repository + "@"));
          if (!digestFull) continue;
          const digest = digestFull.split("@")[1].split(":")[1];

          const containers = dockerState.containers.filter(
            (c) => c.imageId === image.id || image.repoTags.includes(c.image),
          );

          entry.clientIds.add(client.id);
          entry.containerCount += containers.length;

          if (!entry.digestMap.has(digest)) {
            entry.digestMap.set(digest, { clientIds: new Set(), containerCount: 0 });
          }
          const digestEntry = entry.digestMap.get(digest)!;
          digestEntry.clientIds.add(client.id);
          digestEntry.containerCount += containers.length;
        }
      }
    }

    return Array.from(repositoryMap.entries())
      .map(([repositoryKey, data]) => {
        const colonIdx = repositoryKey.lastIndexOf(":");
        const repository = colonIdx !== -1 ? repositoryKey.slice(0, colonIdx) : repositoryKey;
        const tag = colonIdx !== -1 ? repositoryKey.slice(colonIdx + 1) : "";

        const children: ImageTreeNode[] = Array.from(data.digestMap.entries()).map(
          ([digest, digestData]) => ({
            id: `${repositoryKey}@${digest}`,
            nodeType: "image" as const,
            repository,
            tag,
            digest: digest,
            imageCount: 1,
            clientCount: digestData.clientIds.size,
            containerCount: digestData.containerCount,
          }),
        );

        return {
          id: repositoryKey,
          nodeType: "repository" as const,
          repository,
          tag,
          imageCount: data.digestMap.size,
          clientCount: data.clientIds.size,
          containerCount: data.containerCount,
          children: children.length > 0 ? children : undefined,
        };
      })
      .sort((a, b) => {
        const repoCompare = a.repository.localeCompare(b.repository);
        if (repoCompare !== 0) return repoCompare;
        return a.tag.localeCompare(b.tag);
      });
  }, [clients, dockerStates]);
}
