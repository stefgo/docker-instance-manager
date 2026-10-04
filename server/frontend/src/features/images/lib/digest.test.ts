import { describe, expect, it } from "vitest";
import {
    imageRefKey,
    isCheckingImage,
    normalizeImageId,
    normalizeImageRef,
    shortDigest,
    shortImageRef,
    toDigest,
} from "./digest";

describe("toDigest", () => {
    it("drops the repository part, and leaves a bare digest alone", () => {
        expect(toDigest("nginx@sha256:abc")).toBe("sha256:abc");
        expect(toDigest("sha256:abc")).toBe("sha256:abc");
    });
});

describe("shortDigest and shortImageRef", () => {
    const id = "sha256:0123456789abcdef0123456789abcdef";

    it("prints twelve hex characters without the algorithm", () => {
        expect(shortDigest(id)).toBe("0123456789ab");
        expect(shortDigest("0123456789abcdef")).toBe("0123456789ab");
    });

    it("shortens a bare image id and leaves a name as it is", () => {
        expect(shortImageRef(id)).toBe("0123456789ab");
        expect(shortImageRef("nginx:1.27")).toBe("nginx:1.27");
    });
});

describe("normalizeImageId", () => {
    it("adds the algorithm where it is missing", () => {
        expect(normalizeImageId("abc")).toBe("sha256:abc");
        expect(normalizeImageId("sha256:abc")).toBe("sha256:abc");
    });
});

describe("isCheckingImage", () => {
    it("looks an image up by any of its digests", () => {
        const checking = { "sha256:two": true };
        expect(isCheckingImage(checking, ["nginx@sha256:one", "nginx@sha256:two"], "nginx:1.27")).toBe(true);
        expect(isCheckingImage(checking, ["nginx@sha256:one"], "nginx:1.27")).toBe(false);
    });

    it("looks an image without digests up by its reference", () => {
        expect(isCheckingImage({ "nginx:1.27": true }, [], "nginx:1.27")).toBe(true);
        expect(isCheckingImage({ "nginx:1.27": false }, [], "nginx:1.27")).toBe(false);
    });

    it("does not fall back to the reference for an image that has digests", () => {
        expect(isCheckingImage({ "nginx:1.27": true }, ["nginx@sha256:one"], "nginx:1.27")).toBe(false);
    });
});

describe("imageRefKey", () => {
    it("is repository:tag in lower case, with latest where no tag is named", () => {
        expect(imageRefKey("Nginx:1.27")).toBe("nginx:1.27");
        expect(imageRefKey("nginx")).toBe("nginx:latest");
        expect(imageRefKey("localhost:5000/App")).toBe("localhost:5000/app:latest");
    });

    it("gives nothing for a reference pinned to a digest, or for none", () => {
        expect(imageRefKey("nginx@sha256:abc")).toBe("");
        expect(imageRefKey("")).toBe("");
    });
});

describe("normalizeImageRef", () => {
    it("adds latest where the reference names no tag", () => {
        expect(normalizeImageRef("nginx")).toBe("nginx:latest");
        expect(normalizeImageRef("ghcr.io/acme/web")).toBe("ghcr.io/acme/web:latest");
    });

    it("does not take a registry's port for a tag", () => {
        expect(normalizeImageRef("registry.local:5000/web")).toBe("registry.local:5000/web:latest");
        expect(normalizeImageRef("registry.local:5000/web:2")).toBe("registry.local:5000/web:2");
    });

    it("leaves a tag, a digest and an empty reference as they are", () => {
        expect(normalizeImageRef("nginx:1.27")).toBe("nginx:1.27");
        expect(normalizeImageRef("nginx@sha256:abc")).toBe("nginx@sha256:abc");
        expect(normalizeImageRef("")).toBe("");
    });
});
