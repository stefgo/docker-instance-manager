import { describe, expect, it } from "vitest";
import type { DockerImage } from "@dim/shared";
import { updateStatusOf } from "./updateStatus";

const image = (over: Partial<DockerImage> = {}): DockerImage => ({
    id: "sha256:img",
    parentId: "",
    repoTags: ["nginx:1.27"],
    repoDigests: ["nginx@sha256:abc"],
    created: 0,
    size: 0,
    labels: null,
    ...over,
});

const checked = (hasUpdate: boolean, error?: string) => ({
    hasUpdate,
    remoteDigest: "sha256:def",
    checkedAt: "2026-10-03T12:00:00.000Z",
    error,
});

describe("updateStatusOf", () => {
    it("has no status for an image that is not there or not in use", () => {
        expect(updateStatusOf(undefined, true)).toBe("none");
        expect(updateStatusOf(image({ updateCheck: checked(true) }), false)).toBe("none");
    });

    it("has no status for an image that was never pulled from a registry", () => {
        expect(updateStatusOf(image({ repoDigests: [] }), true)).toBe("none");
    });

    it("is unchecked before the first answer, and after one that failed", () => {
        expect(updateStatusOf(image(), true)).toBe("unchecked");
        expect(updateStatusOf(image({ updateCheck: checked(false, "rate limited") }), true)).toBe("unchecked");
        // An error outweighs whatever the answer before it had found.
        expect(updateStatusOf(image({ updateCheck: checked(true, "rate limited") }), true)).toBe("unchecked");
    });

    it("reads the registry's answer", () => {
        expect(updateStatusOf(image({ updateCheck: checked(true) }), true)).toBe("update");
        expect(updateStatusOf(image({ updateCheck: checked(false) }), true)).toBe("current");
    });
});
