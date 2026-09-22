import { useEffect, useMemo } from "react";
import { DockerImageUpdateCheck, formatPlatform } from "@dim/shared";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { belongsTo, containerKey, useProjectAssignment } from "../../projects/hooks/useProjectMembers";
import { normalizeImageId } from "../lib/digest";

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
    clientIds: string[];
    repoDigests: string[];
    /** The platforms of the digest rows below, `os/architecture`, without the unknown one. */
    platforms: string[];
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
    clientIds: string[];
    repoDigests: string[];
    /** The platforms of the digest rows below, `os/architecture`, without the unknown one. */
    platforms: string[];
    updateStatus: UpdateStatus;
    children?: DigestNode[];
}

export interface DigestNode {
    id: string;
    nodeType: "digest";
    repository: string;
    tag: string;
    digest: string;
    /**
     * `os/architecture` of the images in this row, or empty when the agent did not report
     * it. One digest names an index, and an index a different image per platform, so a row
     * is one digest on one platform.
     */
    platform: string;
    imageIds: string[];
    containerIds: string[];
    clientIds: string[];
    repoDigests: string[];
    updateStatus: UpdateStatus;
}

export type ImageTreeNode = RepositoryNode | TagNode | DigestNode;

type DigestEntry = {
    digest: string;
    platform: string;
    imageIds: Set<string>;
    containerIds: Set<string>;
    clientIds: Set<string>;
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
    clientId: string,
    platform: string,
    updateCheck?: DockerImageUpdateCheck,
) {
    if (!repoMap.has(repository)) repoMap.set(repository, new Map());
    const tagMap = repoMap.get(repository)!;
    if (!tagMap.has(tag)) tagMap.set(tag, new Map());
    const digestMap = tagMap.get(tag)!;
    const key = `${digest}|${platform}`;
    if (!digestMap.has(key)) {
        digestMap.set(key, { digest, platform, imageIds: new Set(), containerIds: new Set(), clientIds: new Set(), repoDigests: new Set(), updateChecks: [] });
    }
    const entry = digestMap.get(key)!;
    entry.imageIds.add(imageId);
    entry.clientIds.add(clientId);
    for (const cId of containerIds) entry.containerIds.add(cId);
    for (const rd of repoDigests) entry.repoDigests.add(rd);
    if (updateCheck) entry.updateChecks.push(updateCheck);
}

function computeDigestUpdateStatus(
    entry: DigestEntry,
    canCheck: boolean,
): UpdateStatus {
    // Only an image a container runs is checked: nothing else is changed by an update.
    if (!canCheck || entry.containerIds.size === 0) return "none";
    if (entry.updateChecks.length === 0) return "unchecked";
    if (entry.updateChecks.some((uc) => uc.hasUpdate)) return "update";
    if (entry.updateChecks.every((uc) => !!uc.error)) return "unchecked";
    return "current";
}

/**
 * Every image of the fleet as a repository/tag/digest tree.
 *
 * `projectId` narrows it to the images one project runs on. Only which images are
 * listed is narrowed -- the containers counted on a row stay the full set, so an image a
 * container outside the stack still uses does not look prunable here.
 */
export function useImagesData(projectId?: string): RepositoryNode[] {
    const { clients } = useClientStore();
    const { dockerStates, fetchDockerState } = useDockerStore();
    const assignment = useProjectAssignment();

    useEffect(() => {
        clients.forEach((c) => fetchDockerState(c.id));
    }, [clients, fetchDockerState]);

    return useMemo(() => {
        const repoMap: RepoMap = new Map();

        for (const client of clients) {
            const dockerState = dockerStates[client.id];
            if (!dockerState) continue;

            const imageContainerMap = new Map<string, Set<string>>();
            // What the project runs on this host: the images its containers were built from,
            // by id and by the reference they were configured with.
            const projectImageIds = new Set<string>();
            const projectImageRefs = new Set<string>();
            for (const container of dockerState.containers) {
                const imgId = normalizeImageId(container.imageId);
                if (!imageContainerMap.has(imgId)) imageContainerMap.set(imgId, new Set());
                imageContainerMap.get(imgId)!.add(container.id);

                if (
                    projectId !== undefined &&
                    belongsTo(assignment.get(containerKey(client.id, container.id)), projectId)
                ) {
                    projectImageIds.add(imgId);
                    const ref = container.configImage ?? container.image;
                    if (ref) projectImageRefs.add(ref);
                }
            }

            for (const image of dockerState.images) {
                const imageId = normalizeImageId(image.id);
                if (
                    projectId !== undefined &&
                    !projectImageIds.has(imageId) &&
                    !image.repoTags.some((t) => projectImageRefs.has(t))
                ) {
                    continue;
                }
                const containerIds = imageContainerMap.get(imageId) ?? new Set<string>();
                const platform = formatPlatform(image.platform);

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
                            addEntry(repoMap, repository, tag, digest, imageId, containerIds, [repoDigest], client.id, platform, image.updateCheck);
                        }
                    }
                } else if (image.repoTags.length > 0) {
                    for (const repoTag of image.repoTags) {
                        const colonIdx = repoTag.lastIndexOf(":");
                        const repository = colonIdx !== -1 ? repoTag.slice(0, colonIdx) : repoTag;
                        const tag = colonIdx !== -1 ? repoTag.slice(colonIdx + 1) : "<none>";
                        addEntry(repoMap, repository, tag, imageId, imageId, containerIds, image.repoDigests, client.id, platform, image.updateCheck);
                    }
                } else {
                    addEntry(repoMap, "<none>", "<none>", imageId, imageId, containerIds, [], client.id, platform, image.updateCheck);
                }
            }
        }

        return Array.from(repoMap.entries())
            .map(([repository, tagMap]): RepositoryNode => {
                const allImageIds = new Set<string>();
                const allContainerIds = new Set<string>();
                const allClientIds = new Set<string>();
                const allRepoDigests = new Set<string>();
                const allPlatforms = new Set<string>();
                const tagUpdateStatuses: UpdateStatus[] = [];

                const tagNodes: TagNode[] = Array.from(tagMap.entries())
                    .map(([tag, digestMap]): TagNode => {
                        const tagImageIds = new Set<string>();
                        const tagContainerIds = new Set<string>();
                        const tagClientIds = new Set<string>();
                        const tagRepoDigests = new Set<string>();
                        const tagPlatforms = new Set<string>();
                        const canCheck = repository !== "<none>" && tag !== "<none>";
                        const digestUpdateStatuses: UpdateStatus[] = [];

                        const digestNodes: DigestNode[] = Array.from(digestMap.values()).map(
                            (data): DigestNode => {
                                const { digest, platform } = data;
                                if (platform) {
                                    tagPlatforms.add(platform);
                                    allPlatforms.add(platform);
                                }
                                for (const id of data.imageIds) {
                                    tagImageIds.add(id);
                                    allImageIds.add(id);
                                }
                                for (const id of data.containerIds) {
                                    tagContainerIds.add(id);
                                    allContainerIds.add(id);
                                }
                                for (const id of data.clientIds) {
                                    tagClientIds.add(id);
                                    allClientIds.add(id);
                                }
                                for (const rd of data.repoDigests) {
                                    tagRepoDigests.add(rd);
                                    allRepoDigests.add(rd);
                                }

                                const updateStatus = computeDigestUpdateStatus(data, canCheck);
                                digestUpdateStatuses.push(updateStatus);

                                return {
                                    id: `${repository}:${tag}@${digest}${platform ? `|${platform}` : ""}`,
                                    nodeType: "digest",
                                    repository,
                                    tag,
                                    digest,
                                    platform,
                                    imageIds: Array.from(data.imageIds),
                                    containerIds: Array.from(data.containerIds),
                                    clientIds: Array.from(data.clientIds),
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
                            clientIds: Array.from(tagClientIds),
                            repoDigests: Array.from(tagRepoDigests),
                            platforms: Array.from(tagPlatforms).sort(),
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
                    clientIds: Array.from(allClientIds),
                    repoDigests: Array.from(allRepoDigests),
                    platforms: Array.from(allPlatforms).sort(),
                    updateStatus: aggregateUpdateStatus(tagUpdateStatuses),
                    children: tagNodes.length > 0 ? tagNodes : undefined,
                };
            })
            .sort((a, b) => {
                if (a.repository === "<none>") return 1;
                if (b.repository === "<none>") return -1;
                return a.repository.localeCompare(b.repository);
            });
    }, [clients, dockerStates, assignment, projectId]);
}
