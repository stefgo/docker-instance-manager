import { describe, expect, it } from "vitest";
import { isCheckingImage } from "../features/images/lib/digest";
import { checkingImagesOf, updatingImagesOf, updatingKey } from "./pendingImages";

describe("checkingImagesOf", () => {
    it("is empty while nothing is checked", () => {
        expect(checkingImagesOf([])).toEqual({});
    });

    it("keys a check that named digests by them, so every row of that digest shows it", () => {
        const repoDigests = ["nginx@sha256:aa", "ghcr.io/nginx@sha256:aa"];
        const checking = checkingImagesOf([{ imageRef: "nginx:1", repoDigests }]);
        expect(isCheckingImage(checking, ["nginx@sha256:aa"], "nginx:1")).toBe(true);
        expect(isCheckingImage(checking, ["nginx@sha256:bb"], "nginx:1")).toBe(false);
    });

    it("keys a check without digests by its reference", () => {
        const checking = checkingImagesOf([{ imageRef: "nginx:1", repoDigests: [] }]);
        expect(isCheckingImage(checking, [], "nginx:1")).toBe(true);
        expect(isCheckingImage(checking, [], "nginx:2")).toBe(false);
    });

    it("holds every check that is under way", () => {
        const checking = checkingImagesOf([
            { imageRef: "nginx:1", repoDigests: [] },
            { imageRef: "redis:7", repoDigests: [] },
        ]);
        expect(Object.keys(checking)).toEqual(["nginx:1", "redis:7"]);
    });
});

describe("updatingImagesOf", () => {
    it("names every host a pull was sent to", () => {
        const updating = updatingImagesOf([{ imageRef: "nginx:1", clientIds: ["a", "b"] }]);
        expect(updating[updatingKey("a", "nginx:1")]).toBe(true);
        expect(updating[updatingKey("b", "nginx:1")]).toBe(true);
        expect(updating[updatingKey("c", "nginx:1")]).toBeUndefined();
    });

    it("keeps one reference apart from another on the same host", () => {
        const updating = updatingImagesOf([{ imageRef: "nginx:1", clientIds: ["a"] }]);
        expect(updating[updatingKey("a", "redis:7")]).toBeUndefined();
    });
});
