import { useEffect, useMemo } from "react";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

export interface RepositoryNode {
  id: string;
  nodeType: "repository";
  repository: string;
  imageIds: string[];
  containerIds: string[];
  children?: DigestNode[];
}

export interface DigestNode {
  id: string;
  nodeType: "digest";
  repository: string;
  digest: string;
  imageIds: string[];
  containerIds: string[];
}

export type ImageTreeNode = RepositoryNode | DigestNode;

export function useImagesData(): RepositoryNode[] {
  const { token } = useAuth();
  const { clients } = useClientStore();
  const { dockerStates, fetchDockerState } = useDockerStore();

  useEffect(() => {
    if (token) {
      clients.forEach((c) => fetchDockerState(c.id, token));
    }
  }, [token, clients, fetchDockerState]);

  return useMemo(() => {
    // Key: repository (part before @), Value: map of digest → { imageIds, containerIds }
    const repoMap = new Map<
      string,
      Map<string, { imageIds: Set<string>; containerIds: Set<string> }>
    >();

    for (const client of clients) {
      const dockerState = dockerStates[client.id];
      if (!dockerState) continue;

      // Build imageId → containerIds lookup for this client
      const imageContainerMap = new Map<string, Set<string>>();
      for (const container of dockerState.containers) {
        const normalizedImageId = container.imageId.startsWith("sha256:")
          ? container.imageId
          : `sha256:${container.imageId}`;
        if (!imageContainerMap.has(normalizedImageId)) {
          imageContainerMap.set(normalizedImageId, new Set());
        }
        imageContainerMap.get(normalizedImageId)!.add(container.id);
      }

      for (const image of dockerState.images) {
        const normalizedImageId = image.id.startsWith("sha256:")
          ? image.id
          : `sha256:${image.id}`;
        const containerIds = imageContainerMap.get(normalizedImageId) ?? new Set<string>();

        if (image.repoDigests.length > 0) {
          for (const repoDigest of image.repoDigests) {
            const atIdx = repoDigest.indexOf("@");
            const repository = atIdx !== -1 ? repoDigest.slice(0, atIdx) : repoDigest;
            const digest = atIdx !== -1 ? repoDigest.slice(atIdx + 1) : normalizedImageId;

            if (!repoMap.has(repository)) {
              repoMap.set(repository, new Map());
            }
            const digestMap = repoMap.get(repository)!;
            if (!digestMap.has(digest)) {
              digestMap.set(digest, { imageIds: new Set(), containerIds: new Set() });
            }
            const entry = digestMap.get(digest)!;
            entry.imageIds.add(normalizedImageId);
            for (const cId of containerIds) entry.containerIds.add(cId);
          }
        } else {
          // No repoDigests → group under <none>
          const repository = "<none>";
          const digest = normalizedImageId;

          if (!repoMap.has(repository)) {
            repoMap.set(repository, new Map());
          }
          const digestMap = repoMap.get(repository)!;
          if (!digestMap.has(digest)) {
            digestMap.set(digest, { imageIds: new Set(), containerIds: new Set() });
          }
          const entry = digestMap.get(digest)!;
          entry.imageIds.add(normalizedImageId);
          for (const cId of containerIds) entry.containerIds.add(cId);
        }
      }
    }

    return Array.from(repoMap.entries())
      .map(([repository, digestMap]): RepositoryNode => {
        const allImageIds = new Set<string>();
        const allContainerIds = new Set<string>();

        const children: DigestNode[] = Array.from(digestMap.entries()).map(
          ([digest, data]): DigestNode => {
            for (const id of data.imageIds) allImageIds.add(id);
            for (const id of data.containerIds) allContainerIds.add(id);

            return {
              id: `${repository}@${digest}`,
              nodeType: "digest",
              repository,
              digest,
              imageIds: Array.from(data.imageIds),
              containerIds: Array.from(data.containerIds),
            };
          },
        );

        return {
          id: repository,
          nodeType: "repository",
          repository,
          imageIds: Array.from(allImageIds),
          containerIds: Array.from(allContainerIds),
          children: children.length > 0 ? children : undefined,
        };
      })
      .sort((a, b) => {
        if (a.repository === "<none>") return 1;
        if (b.repository === "<none>") return -1;
        return a.repository.localeCompare(b.repository);
      });
  }, [clients, dockerStates]);
}
