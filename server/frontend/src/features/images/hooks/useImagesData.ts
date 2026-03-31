import { useEffect, useMemo } from "react";
import { DockerImageUpdateCheck } from "@dim/shared";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useAuth } from "../../auth/AuthContext";

// Priority: hasUpdate (3) > unchecked (2) > current (1) > not checkable (0)
export type UpdateStatus = "update" | "unchecked" | "current" | "none";

function updateStatusPriority(status: UpdateStatus): number {
  switch (status) {
    case "update": return 3;
    case "unchecked": return 2;
    case "current": return 1;
    case "none": return 0;
  }
}

export function aggregateUpdateStatus(statuses: UpdateStatus[]): UpdateStatus {
  let best: UpdateStatus = "none";
  for (const s of statuses) {
    if (updateStatusPriority(s) > updateStatusPriority(best)) best = s;
  }
  return best;
}

export interface RepositoryNode {
  id: string;
  nodeType: "repository";
  repository: string;
  imageIds: string[];
  containerIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
  children?: TagNode[];
}

export interface TagNode {
  id: string;
  nodeType: "tag";
  repository: string;
  tag: string;
  imageIds: string[];
  containerIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
  children?: DigestNode[];
}

export interface DigestNode {
  id: string;
  nodeType: "digest";
  repository: string;
  tag: string;
  digest: string;
  imageIds: string[];
  containerIds: string[];
  repoDigests: string[];
  updateStatus: UpdateStatus;
}

export type ImageTreeNode = RepositoryNode | TagNode | DigestNode;

type DigestEntry = {
  imageIds: Set<string>;
  containerIds: Set<string>;
  repoDigests: Set<string>;
  updateChecks: DockerImageUpdateCheck[];
};
type TagMap = Map<string, Map<string, DigestEntry>>;
type RepoMap = Map<string, TagMap>;

function addEntry(
  repoMap: RepoMap,
  repository: string,
  tag: string,
  digest: string,
  imageId: string,
  containerIds: Set<string>,
  repoDigests: string[],
  updateCheck?: DockerImageUpdateCheck,
) {
  if (!repoMap.has(repository)) repoMap.set(repository, new Map());
  const tagMap = repoMap.get(repository)!;
  if (!tagMap.has(tag)) tagMap.set(tag, new Map());
  const digestMap = tagMap.get(tag)!;
  if (!digestMap.has(digest)) {
    digestMap.set(digest, { imageIds: new Set(), containerIds: new Set(), repoDigests: new Set(), updateChecks: [] });
  }
  const entry = digestMap.get(digest)!;
  entry.imageIds.add(imageId);
  for (const cId of containerIds) entry.containerIds.add(cId);
  for (const rd of repoDigests) entry.repoDigests.add(rd);
  if (updateCheck) entry.updateChecks.push(updateCheck);
}

function computeDigestUpdateStatus(
  entry: DigestEntry,
  canCheck: boolean,
): UpdateStatus {
  if (!canCheck) return "none";
  if (entry.updateChecks.length === 0) return "unchecked";
  if (entry.updateChecks.some((uc) => uc.hasUpdate)) return "update";
  if (entry.updateChecks.every((uc) => !!uc.error)) return "unchecked";
  return "current";
}

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
    const repoMap: RepoMap = new Map();

    for (const client of clients) {
      const dockerState = dockerStates[client.id];
      if (!dockerState) continue;

      const imageContainerMap = new Map<string, Set<string>>();
      for (const container of dockerState.containers) {
        const imgId = container.imageId.startsWith("sha256:")
          ? container.imageId
          : `sha256:${container.imageId}`;
        if (!imageContainerMap.has(imgId)) imageContainerMap.set(imgId, new Set());
        imageContainerMap.get(imgId)!.add(container.id);
      }

      for (const image of dockerState.images) {
        const imageId = image.id.startsWith("sha256:") ? image.id : `sha256:${image.id}`;
        const containerIds = imageContainerMap.get(imageId) ?? new Set<string>();

        if (image.repoDigests.length > 0) {
          for (const repoDigest of image.repoDigests) {
            const atIdx = repoDigest.indexOf("@");
            const repository = atIdx !== -1 ? repoDigest.slice(0, atIdx) : "<none>";
            const digest = atIdx !== -1 ? repoDigest.slice(atIdx + 1) : imageId;

            const tagsForRepo = image.repoTags
              .filter((t) => t.startsWith(repository + ":"))
              .map((t) => t.slice(repository.length + 1));

            const tags = tagsForRepo.length > 0 ? tagsForRepo : ["<none>"];

            for (const tag of tags) {
              addEntry(repoMap, repository, tag, digest, imageId, containerIds, image.repoDigests, image.updateCheck);
            }
          }
        } else if (image.repoTags.length > 0) {
          for (const repoTag of image.repoTags) {
            const colonIdx = repoTag.lastIndexOf(":");
            const repository = colonIdx !== -1 ? repoTag.slice(0, colonIdx) : repoTag;
            const tag = colonIdx !== -1 ? repoTag.slice(colonIdx + 1) : "<none>";
            addEntry(repoMap, repository, tag, imageId, imageId, containerIds, image.repoDigests, image.updateCheck);
          }
        } else {
          addEntry(repoMap, "<none>", "<none>", imageId, imageId, containerIds, [], image.updateCheck);
        }
      }
    }

    return Array.from(repoMap.entries())
      .map(([repository, tagMap]): RepositoryNode => {
        const allImageIds = new Set<string>();
        const allContainerIds = new Set<string>();
        const allRepoDigests = new Set<string>();
        const tagUpdateStatuses: UpdateStatus[] = [];

        const tagNodes: TagNode[] = Array.from(tagMap.entries())
          .map(([tag, digestMap]): TagNode => {
            const tagImageIds = new Set<string>();
            const tagContainerIds = new Set<string>();
            const tagRepoDigests = new Set<string>();
            const canCheck = repository !== "<none>" && tag !== "<none>";
            const digestUpdateStatuses: UpdateStatus[] = [];

            const digestNodes: DigestNode[] = Array.from(digestMap.entries()).map(
              ([digest, data]): DigestNode => {
                for (const id of data.imageIds) {
                  tagImageIds.add(id);
                  allImageIds.add(id);
                }
                for (const id of data.containerIds) {
                  tagContainerIds.add(id);
                  allContainerIds.add(id);
                }
                for (const rd of data.repoDigests) {
                  tagRepoDigests.add(rd);
                  allRepoDigests.add(rd);
                }

                const updateStatus = computeDigestUpdateStatus(data, canCheck);
                digestUpdateStatuses.push(updateStatus);

                return {
                  id: `${repository}:${tag}@${digest}`,
                  nodeType: "digest",
                  repository,
                  tag,
                  digest,
                  imageIds: Array.from(data.imageIds),
                  containerIds: Array.from(data.containerIds),
                  repoDigests: Array.from(data.repoDigests),
                  updateStatus,
                };
              },
            );

            const tagUpdateStatus = aggregateUpdateStatus(digestUpdateStatuses);
            tagUpdateStatuses.push(tagUpdateStatus);

            return {
              id: `${repository}:${tag}`,
              nodeType: "tag",
              repository,
              tag,
              imageIds: Array.from(tagImageIds),
              containerIds: Array.from(tagContainerIds),
              repoDigests: Array.from(tagRepoDigests),
              updateStatus: tagUpdateStatus,
              children: digestNodes.length > 0 ? digestNodes : undefined,
            };
          })
          .sort((a, b) => {
            if (a.tag === "<none>") return 1;
            if (b.tag === "<none>") return -1;
            return a.tag.localeCompare(b.tag);
          });

        return {
          id: repository,
          nodeType: "repository",
          repository,
          imageIds: Array.from(allImageIds),
          containerIds: Array.from(allContainerIds),
          repoDigests: Array.from(allRepoDigests),
          updateStatus: aggregateUpdateStatus(tagUpdateStatuses),
          children: tagNodes.length > 0 ? tagNodes : undefined,
        };
      })
      .sort((a, b) => {
        if (a.repository === "<none>") return 1;
        if (b.repository === "<none>") return -1;
        return a.repository.localeCompare(b.repository);
      });
  }, [clients, dockerStates]);
}
