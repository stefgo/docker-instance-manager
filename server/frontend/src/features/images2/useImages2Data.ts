import { useEffect, useMemo } from "react";
import { DockerImageUpdateCheck } from "@dim/shared";
import { useClientStore } from "../../stores/useClientStore";
import { useDockerStore } from "../../stores/useDockerStore";
import { useAuth } from "../auth/AuthContext";
import { ImageTreeNode } from "./images2Types";

function aggregateUpdateCheck(checks: (DockerImageUpdateCheck | undefined)[]): DockerImageUpdateCheck | undefined {
  const valid = checks.filter((c): c is DockerImageUpdateCheck => c !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.some((c) => c.hasUpdate)) {
    return valid.find((c) => c.hasUpdate)!;
  }
  if (valid.every((c) => !c.error)) {
    // All checked, none have update — use the most recently checked
    return valid.reduce((a, b) => (a.checkedAt > b.checkedAt ? a : b));
  }
  // Mix of errors and no-update — return most recent
  return valid.reduce((a, b) => (a.checkedAt > b.checkedAt ? a : b));
}

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
        digestMap: Map<string, { clientIds: Set<string>; containerCount: number; updateCheck?: DockerImageUpdateCheck }>;
        repoDigests: string[];
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
              repoDigests: [],
            });
          }

          const entry = repositoryMap.get(repositoryKey)!;
          const digestFull = image.repoDigests.find((d) => d.startsWith(repository + "@"));
          if (!digestFull) continue;
          const digest = digestFull.split("@")[1].split(":")[1];

          if (!entry.repoDigests.includes(digestFull)) {
            entry.repoDigests.push(digestFull);
          }

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

          // Carry over updateCheck from the image (first client that has it wins)
          if (!digestEntry.updateCheck && image.updateCheck) {
            digestEntry.updateCheck = image.updateCheck;
          }
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
            digest,
            imageCount: 1,
            containerCount: digestData.containerCount,
            clientIds: Array.from(digestData.clientIds),
            repoDigests: data.repoDigests,
            updateCheck: digestData.updateCheck,
          }),
        );

        return {
          id: repositoryKey,
          nodeType: "repository" as const,
          repository,
          tag,
          imageCount: data.digestMap.size,
          containerCount: data.containerCount,
          clientIds: Array.from(data.clientIds),
          repoDigests: data.repoDigests,
          updateCheck: aggregateUpdateCheck(children.map((c) => c.updateCheck)),
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
