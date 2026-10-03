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
        expect(filterImages(tree, "")).toBe(tree);
    });

    it("keeps everything below a repository that matches", () => {
        expect(filterImages(tree, "ngi")).toEqual([nginx]);
    });

    it("compares without regard to case", () => {
        expect(filterImages(tree, "REDIS")).toEqual([redis]);
    });

    it("keeps a matching tag whole, and drops its siblings", () => {
        expect(filterImages(tree, "alpine")).toEqual([{ ...nginx, children: [alpine] }]);
    });

    it("keeps only the matching digest rows below a tag that does not match", () => {
        expect(filterImages(tree, "bbb2")).toEqual([{ ...nginx, children: [{ ...stable, children: [arm] }] }]);
    });

    it("finds a digest row by its platform", () => {
        expect(filterImages(tree, "arm64")).toEqual([{ ...nginx, children: [{ ...stable, children: [arm] }] }]);
    });

    it("gives nothing where nothing matches", () => {
        expect(filterImages(tree, "postgres")).toEqual([]);
    });
});
