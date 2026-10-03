import { describe, expect, it } from "vitest";
import { digestNode, repositoryNode, tagNode } from "./imageTree.testdata";
import {
    canCheck,
    collectCheckableDigests,
    collectTaggedDigests,
    isNodeChecking,
    isNodeUpdating,
    nodeHasContainers,
} from "./nodeStatus";

const used = digestNode({ id: "used", digest: "sha256:used", containerIds: ["c1"] });
const unused = digestNode({ id: "unused", digest: "sha256:unused", containerIds: [] });
const dangling = digestNode({ id: "dangling", repository: "<none>", tag: "<none>", containerIds: ["c2"] });
const untagged = digestNode({ id: "untagged", tag: "<none>", containerIds: ["c3"] });

describe("collectTaggedDigests", () => {
    it("is the row itself for a digest with a pullable repository:tag", () => {
        expect(collectTaggedDigests(used)).toEqual([used]);
    });

    it("leaves out an image without a repository or without a tag", () => {
        expect(collectTaggedDigests(dangling)).toEqual([]);
        expect(collectTaggedDigests(untagged)).toEqual([]);
    });

    it("walks the tree below a tag and a repository", () => {
        const tag = tagNode({ children: [used, unused, untagged] });
        expect(collectTaggedDigests(tag)).toEqual([used, unused]);
        expect(collectTaggedDigests(repositoryNode({ children: [tag, tagNode({ children: [dangling] })] }))).toEqual([
            used,
            unused,
        ]);
    });

    it("gives nothing for a row without children", () => {
        expect(collectTaggedDigests(tagNode({ children: undefined }))).toEqual([]);
    });
});

describe("collectCheckableDigests and canCheck", () => {
    it("keeps the tagged digests a container runs", () => {
        const tag = tagNode({ children: [used, unused] });
        expect(collectCheckableDigests(tag)).toEqual([used]);
        expect(canCheck(tag)).toBe(true);
    });

    it("cannot check an image no container uses", () => {
        expect(canCheck(tagNode({ children: [unused] }))).toBe(false);
    });

    it("cannot check an image in use that has no tag to ask the registry about", () => {
        expect(canCheck(tagNode({ children: [dangling, untagged] }))).toBe(false);
    });
});

describe("nodeHasContainers", () => {
    it("says whether a pull of the row would recreate containers", () => {
        expect(nodeHasContainers(used)).toBe(true);
        expect(nodeHasContainers(unused)).toBe(false);
        expect(nodeHasContainers(repositoryNode({ children: [tagNode({ children: [unused, used] })] }))).toBe(true);
        expect(nodeHasContainers(repositoryNode({ children: [tagNode({ children: [unused] })] }))).toBe(false);
    });
});

describe("isNodeChecking", () => {
    it("looks a digest row up by its digest", () => {
        expect(isNodeChecking(used, { "sha256:used": true })).toBe(true);
        expect(isNodeChecking(used, { "sha256:other": true })).toBe(false);
    });

    it("looks a tag row up by its digests, or by its reference when it has none", () => {
        const tag = tagNode({ repoDigests: ["nginx@sha256:used"] });
        expect(isNodeChecking(tag, { "sha256:used": true })).toBe(true);
        expect(isNodeChecking(tagNode({ repoDigests: [] }), { "nginx:1.27": true })).toBe(true);
        expect(isNodeChecking(tag, {})).toBe(false);
    });

    it("is true for a repository as soon as one of its tags is being checked", () => {
        const repo = repositoryNode({
            children: [
                tagNode({ tag: "1.27", repoDigests: ["nginx@sha256:one"] }),
                tagNode({ tag: "alpine", repoDigests: ["nginx@sha256:two"] }),
            ],
        });
        expect(isNodeChecking(repo, { "sha256:two": true })).toBe(true);
        expect(isNodeChecking(repo, { "sha256:three": true })).toBe(false);
        expect(isNodeChecking(repositoryNode({ children: undefined }), { "sha256:two": true })).toBe(false);
    });
});

describe("isNodeUpdating", () => {
    const tag = tagNode({ clientIds: ["h1", "h2"] });

    it("is true while a pull of the tag runs on any of its hosts", () => {
        expect(isNodeUpdating(tag, { "h2::nginx:1.27": true })).toBe(true);
        expect(isNodeUpdating(digestNode({ clientIds: ["h1"] }), { "h1::nginx:1.27": true })).toBe(true);
    });

    it("is false for a pull on another host or of another tag", () => {
        expect(isNodeUpdating(tag, { "h3::nginx:1.27": true })).toBe(false);
        expect(isNodeUpdating(tag, { "h1::nginx:alpine": true })).toBe(false);
        expect(isNodeUpdating(tag, { "h1::nginx:1.27": false })).toBe(false);
    });

    it("is true for a repository as soon as one of its tags is being pulled", () => {
        const repo = repositoryNode({ children: [tag, tagNode({ tag: "alpine", clientIds: ["h3"] })] });
        expect(isNodeUpdating(repo, { "h3::nginx:alpine": true })).toBe(true);
        expect(isNodeUpdating(repo, { "h3::nginx:1.27": true })).toBe(false);
    });
});
