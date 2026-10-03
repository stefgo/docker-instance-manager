import type { DigestNode, RepositoryNode, TagNode } from "../hooks/useImagesData";

/** Nodes of the image tree for the tests of this directory, with only what they vary. */
export const digestNode = (over: Partial<DigestNode> = {}): DigestNode => ({
    id: "nginx:1.27@sha256:abc",
    nodeType: "digest",
    repository: "nginx",
    tag: "1.27",
    digest: "sha256:abc",
    platform: "linux/amd64",
    imageIds: ["sha256:img"],
    containerIds: ["c1"],
    clientIds: ["h1"],
    repoDigests: ["nginx@sha256:abc"],
    updateStatus: "current",
    ...over,
});

export const tagNode = (over: Partial<TagNode> = {}): TagNode => ({
    id: "nginx:1.27",
    nodeType: "tag",
    repository: "nginx",
    tag: "1.27",
    imageIds: ["sha256:img"],
    containerIds: ["c1"],
    clientIds: ["h1"],
    repoDigests: ["nginx@sha256:abc"],
    platforms: ["linux/amd64"],
    updateStatus: "current",
    children: [digestNode()],
    ...over,
});

export const repositoryNode = (over: Partial<RepositoryNode> = {}): RepositoryNode => ({
    id: "nginx",
    nodeType: "repository",
    repository: "nginx",
    imageIds: ["sha256:img"],
    containerIds: ["c1"],
    clientIds: ["h1"],
    repoDigests: ["nginx@sha256:abc"],
    platforms: ["linux/amd64"],
    updateStatus: "current",
    children: [tagNode()],
    ...over,
});
