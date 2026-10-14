import { describe, expect, it } from "vitest";
import { filterImages } from "./filterImages";
import { digestNode, repositoryNode, tagNode } from "./imageTree.testdata";

const amd = digestNode({ id: "amd", digest: "sha256:aaa111", platform: "linux/amd64" });
const arm = digestNode({ id: "arm", digest: "sha256:bbb222", platform: "linux/arm64" });
const stable = tagNode({ id: "nginx:1.27", tag: "1.27", children: [amd, arm] });
const alpine = tagNode({ id: "nginx:alpine", tag: "alpine", children: [amd] });
const nginx = repositoryNode({ id: "nginx", repository: "nginx", children: [stable, alpine] });
const redis = repositoryNode({ id: "redis", repository: "library/Redis", children: [tagNode({ tag: "7", children: [] })] });
const tree = [nginx, redis];

describe("filterImages", () => {
    it("returns the tree as it is without a query", () => {
        expect(filterImages(tree, {})).toBe(tree);
    });

    it("keeps everything below a repository that matches", () => {
        expect(filterImages(tree, { query: "ngi" })).toEqual([nginx]);
    });

    it("compares without regard to case", () => {
        expect(filterImages(tree, { query: "REDIS" })).toEqual([redis]);
    });

    it("keeps a matching tag whole, and drops its siblings", () => {
        expect(filterImages(tree, { query: "alpine" })).toEqual([{ ...nginx, children: [alpine] }]);
    });

    it("keeps only the matching digest rows below a tag that does not match", () => {
        expect(filterImages(tree, { query: "bbb2" })).toEqual([{ ...nginx, children: [{ ...stable, children: [arm] }] }]);
    });

    it("finds a digest row by its platform", () => {
        expect(filterImages(tree, { query: "arm64" })).toEqual([{ ...nginx, children: [{ ...stable, children: [arm] }] }]);
    });

    it("gives nothing where nothing matches", () => {
        expect(filterImages(tree, { query: "postgres" })).toEqual([]);
    });
});

describe("filterImages by update status", () => {
    const old = digestNode({ id: "old", digest: "sha256:ccc333", updateStatus: "update" });
    const never = digestNode({ id: "never", digest: "sha256:ddd444", updateStatus: "unchecked" });
    const mixed = tagNode({ id: "nginx:1.26", tag: "1.26", updateStatus: "update", children: [old, never] });
    const repo = repositoryNode({ id: "nginx", updateStatus: "update", children: [stable, mixed] });
    const unused = repositoryNode({
        id: "busybox",
        repository: "busybox",
        updateStatus: "none",
        children: [tagNode({ tag: "latest", updateStatus: "none", children: [digestNode({ id: "bb", updateStatus: "none" })] })],
    });
    const statusTree = [repo, unused];

    it("returns the tree as it is for every status", () => {
        expect(filterImages(statusTree, { update: "all" })).toBe(statusTree);
    });

    it("keeps the digest rows with the status asked for, and the rows above them", () => {
        expect(filterImages(statusTree, { update: "update" })).toEqual([{ ...repo, children: [{ ...mixed, children: [old] }] }]);
        expect(filterImages(statusTree, { update: "unchecked" })).toEqual([{ ...repo, children: [{ ...mixed, children: [never] }] }]);
    });

    it("hands back a tag itself where every row below it stays", () => {
        const [kept] = filterImages(statusTree, { update: "current" });
        expect(kept.children?.[0]).toBe(stable);
    });

    it("hands back a repository itself where every row below it stays", () => {
        expect(filterImages([nginx], { update: "current" })[0]).toBe(nginx);
    });

    it("leaves a row that keeps only some rows its status as a whole", () => {
        const [kept] = filterImages(statusTree, { update: "current" });
        expect(kept.updateStatus).toBe("update");
    });

    it("lets an image there is nothing to check for through no filter but all", () => {
        for (const update of ["update", "current", "unchecked"] as const) {
            expect(filterImages([unused], { update })).toEqual([]);
        }
    });

    it("narrows a search by the status", () => {
        expect(filterImages(statusTree, { query: "1.26", update: "update" })).toEqual([{ ...repo, children: [{ ...mixed, children: [old] }] }]);
        expect(filterImages(statusTree, { query: "1.27", update: "update" })).toEqual([]);
    });
});
