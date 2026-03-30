import { useEffect, useMemo } from "react";
import { DockerImageUpdateCheck } from "@dim/shared";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

export interface RepositoryNode {
  id: string; // "repository:tag"
  nodeType: "repository";
  repository: string;
  tag: string;
  imageCount: number;
  containerCount: number;
  clientIds: string[];
  repoDigests: string[];
  updateCheck?: DockerImageUpdateCheck;
  children?: ImageNode[];
}

export interface ImageNode {
  id: string; // "repository:tag@digest"
  nodeType: "image";
  repository: string;
  tag: string;
  digest: string;
  containerCount: number;
  clientIds: string[];
  repoDigests: string[];
  updateCheck?: DockerImageUpdateCheck;
}

export type ImageTreeNode = RepositoryNode | ImageNode;

function aggregateUpdateCheck(checks: (DockerImageUpdateCheck | undefined)[]): DockerImageUpdateCheck | undefined {
  const valid = checks.filter((c): c is DockerImageUpdateCheck => c !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.some((c) => c.hasUpdate)) {
    return valid.find((c) => c.hasUpdate)!;
  }
  if (valid.every((c) => !c.error)) {
    return valid.reduce((a, b) => (a.checkedAt > b.checkedAt ? a : b));
  }
  return valid.reduce((a, b) => (a.checkedAt > b.checkedAt ? a : b));
}

export function useImagesData(): ImageTreeNode[] {
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
        const tags = image.repoTags.length > 0
          ? image.repoTags
          : image.repoDigests.length > 0
            ? image.repoDigests.map((d) => `${d.split("@")[0]}:<none>`)
            : ["<none>:<none>"];

        for (const repoTag of tags) {
          const colonIdx = repoTag.lastIndexOf(":");
          const repository = colonIdx !== -1 ? repoTag.slice(0, colonIdx) : repoTag;
          const tag = colonIdx !== -1 ? repoTag.slice(colonIdx + 1) : "<none>";
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
          const imageIdFallback = image.id.split(":")[1] ?? image.id;
          const digest: string = digestFull?.split("@")[1]?.split(":")[1] ?? imageIdFallback;

          if (digestFull && !entry.repoDigests.includes(digestFull)) {
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

          if (!digestEntry.updateCheck && image.updateCheck) {
            digestEntry.updateCheck = image.updateCheck;
          }
        }
      }
    }

    return Array.from(repositoryMap.entries())
      .map(([repositoryKey, data]): RepositoryNode => {
        const colonIdx = repositoryKey.lastIndexOf(":");
        const repository = colonIdx !== -1 ? repositoryKey.slice(0, colonIdx) : repositoryKey;
        const tag = colonIdx !== -1 ? repositoryKey.slice(colonIdx + 1) : "";

        const children: ImageNode[] = Array.from(data.digestMap.entries()).map(
          ([digest, digestData]): ImageNode => ({
            id: `${repositoryKey}@${digest}`,
            nodeType: "image",
            repository,
            tag,
            digest,
            containerCount: digestData.containerCount,
            clientIds: Array.from(digestData.clientIds),
            repoDigests: data.repoDigests,
            updateCheck: digestData.updateCheck,
          }),
        );

        return {
          id: repositoryKey,
          nodeType: "repository",
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
