import { describe, expect, it } from "vitest";
import {
    formatPlatform,
    imageCheckTargetKey,
    imageIdsInUse,
    isImageInUse,
    localDigestOf,
    parsePlatform,
    parseRepoTag,
    registryLabel,
    registryOf,
} from "./imageCheck.js";

describe("formatPlatform and parsePlatform", () => {
    it("writes os/architecture", () => {
        expect(formatPlatform({ os: "linux", architecture: "amd64" })).toBe("linux/amd64");
    });

    it("keys an image without a known platform by the empty string", () => {
        // An agent that predates the field sends none.
        expect(formatPlatform(undefined)).toBe("");
        expect(formatPlatform(null)).toBe("");
    });

    it("reverses the format", () => {
        expect(parsePlatform("linux/arm64")).toEqual({ os: "linux", architecture: "arm64" });
    });

    it("keeps a variant in the architecture", () => {
        expect(parsePlatform("linux/arm/v7")).toEqual({ os: "linux", architecture: "arm/v7" });
    });

    it("gives undefined for the empty string and anything malformed", () => {
        expect(parsePlatform("")).toBeUndefined();
        expect(parsePlatform("linux")).toBeUndefined();
        expect(parsePlatform("/amd64")).toBeUndefined();
        expect(parsePlatform("linux/")).toBeUndefined();
    });
});

describe("localDigestOf", () => {
    it("finds the digest of the tag's repository", () => {
        expect(localDigestOf("nginx:1.27", ["nginx@sha256:abc"])).toBe("sha256:abc");
    });

    it("picks the entry of the right repository among several", () => {
        const digests = ["ghcr.io/owner/app@sha256:one", "owner/app@sha256:two"];
        expect(localDigestOf("owner/app:1", digests)).toBe("sha256:two");
        expect(localDigestOf("ghcr.io/owner/app:1", digests)).toBe("sha256:one");
    });

    it("does not take a repository that only starts the same", () => {
        expect(localDigestOf("nginx:1.27", ["nginx-unprivileged@sha256:abc"])).toBeNull();
    });

    it("is null for an image that was never pulled from a registry", () => {
        expect(localDigestOf("local/build:dev", [])).toBeNull();
    });
});

describe("imageCheckTargetKey", () => {
    it("joins tag, platform and local digest", () => {
        expect(
            imageCheckTargetKey({
                repoTag: "nginx:1.27",
                repoDigests: ["nginx@sha256:abc"],
                platform: { os: "linux", architecture: "amd64" },
            }),
        ).toBe("nginx:1.27|linux/amd64|sha256:abc");
    });

    it("leaves the parts it does not know empty", () => {
        expect(imageCheckTargetKey({ repoTag: "nginx:1.27", repoDigests: [] })).toBe("nginx:1.27||");
    });

    it("tells the same tag on two platforms apart", () => {
        const base = { repoTag: "nginx:1.27", repoDigests: ["nginx@sha256:abc"] };
        expect(imageCheckTargetKey({ ...base, platform: { os: "linux", architecture: "amd64" } })).not.toBe(
            imageCheckTargetKey({ ...base, platform: { os: "linux", architecture: "arm64" } }),
        );
    });

    it("changes with the digest, so a pull invalidates the cached answer", () => {
        const before = imageCheckTargetKey({ repoTag: "nginx:1.27", repoDigests: ["nginx@sha256:old"] });
        const after = imageCheckTargetKey({ repoTag: "nginx:1.27", repoDigests: ["nginx@sha256:new"] });
        expect(before).not.toBe(after);
    });
});

describe("imageIdsInUse and isImageInUse", () => {
    it("matches an id with and without the sha256: prefix", () => {
        const inUse = imageIdsInUse([{ imageId: "aaa" }, { imageId: "sha256:bbb" }]);
        expect(isImageInUse({ id: "sha256:aaa" }, inUse)).toBe(true);
        expect(isImageInUse({ id: "bbb" }, inUse)).toBe(true);
        expect(isImageInUse({ id: "sha256:ccc" }, inUse)).toBe(false);
    });

    it("skips a container without an image id", () => {
        expect(imageIdsInUse([{ imageId: "" }]).size).toBe(0);
    });
});

describe("parseRepoTag", () => {
    it("puts an official image under library/ on Docker Hub", () => {
        expect(parseRepoTag("nginx:latest")).toEqual({
            registry: "registry-1.docker.io",
            name: "library/nginx",
            tag: "latest",
        });
    });

    it("keeps a user image on Docker Hub as it is", () => {
        expect(parseRepoTag("myuser/myimage:1.0")).toEqual({
            registry: "registry-1.docker.io",
            name: "myuser/myimage",
            tag: "1.0",
        });
    });

    it("reads a first segment with a dot as the registry", () => {
        expect(parseRepoTag("ghcr.io/owner/image:tag")).toEqual({
            registry: "ghcr.io",
            name: "owner/image",
            tag: "tag",
        });
    });

    it("reads a first segment with a port, and localhost, as the registry", () => {
        expect(parseRepoTag("registry:5000/app:1")).toEqual({ registry: "registry:5000", name: "app", tag: "1" });
        expect(parseRepoTag("localhost/app")).toEqual({ registry: "localhost", name: "app", tag: "latest" });
    });

    it("does not add library/ on another registry", () => {
        expect(parseRepoTag("ghcr.io/app:1").name).toBe("app");
    });

    it("defaults the tag to latest and drops a digest", () => {
        expect(parseRepoTag("nginx")).toMatchObject({ name: "library/nginx", tag: "latest" });
        expect(parseRepoTag("nginx:1.27@sha256:abc")).toMatchObject({ name: "library/nginx", tag: "1.27" });
    });
});

describe("registryOf and registryLabel", () => {
    it("names the registry a tag is pulled from", () => {
        expect(registryOf("nginx:latest")).toBe("registry-1.docker.io");
        expect(registryOf("ghcr.io/owner/image:tag")).toBe("ghcr.io");
    });

    it("calls Docker Hub by its name and every other registry by its host", () => {
        expect(registryLabel("registry-1.docker.io")).toBe("Docker Hub");
        expect(registryLabel("ghcr.io")).toBe("ghcr.io");
    });
});
