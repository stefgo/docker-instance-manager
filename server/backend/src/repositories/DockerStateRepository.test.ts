import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/AppConfig.js", () => ({
    appConfig: { secretKey: "test-secret-key" },
    secretKeyPersisted: () => true,
}));
vi.mock("../core/Database.js", async () => {
    const { migratedMemoryDatabase } = await import("../testing/memoryDatabase.js");
    return { default: await migratedMemoryDatabase() };
});

import db from "../core/Database.js";
import { DockerStateRepository, type StoredImageCheck } from "./DockerStateRepository.js";

const amd64 = { os: "linux", architecture: "amd64" };
const target = { repoTag: "nginx:latest", repoDigests: ["nginx@sha256:old"], platform: amd64 };

const store = (over: Partial<StoredImageCheck> = {}) =>
    DockerStateRepository.updateImageCheckResult({
        imageRef: "nginx:latest",
        platform: amd64,
        localDigest: "sha256:old",
        hasUpdate: false,
        remoteDigest: "sha256:new",
        checkedAt: "2026-11-01T10:00:00.000Z",
        ...over,
    });

beforeEach(() => {
    db.exec("DELETE FROM image_update_checks");
});

describe("findReusableCheck", () => {
    it("hands back an answer without an update", () => {
        store();
        expect(DockerStateRepository.findReusableCheck(target)).toEqual({ remoteDigest: "sha256:new", hasUpdate: false });
    });

    it("hands back an update together with its labels", () => {
        store({ hasUpdate: true, remoteLabels: { "org.opencontainers.image.version": "1.27.3" } });
        expect(DockerStateRepository.findReusableCheck(target)).toEqual({ remoteDigest: "sha256:new", hasUpdate: true });
    });

    it("hands back an update of an image that has no labels", () => {
        store({ hasUpdate: true, remoteLabels: {} });
        expect(DockerStateRepository.findReusableCheck(target)?.hasUpdate).toBe(true);
    });

    it("leaves an update whose labels are missing to the full check", () => {
        store({ hasUpdate: true });
        expect(DockerStateRepository.findReusableCheck(target)).toBeUndefined();
    });

    it("leaves an answer with an error to the full check", () => {
        store({ error: "No image for linux/amd64" });
        expect(DockerStateRepository.findReusableCheck(target)).toBeUndefined();
    });

    it("leaves a check the rate limit skipped to the full check", () => {
        store();
        DockerStateRepository.recordImageCheckSkipped(
            { ...target, clientIds: ["h1"] },
            "Registry rate limit reached (429)",
            "2026-11-01T11:00:00.000Z",
        );
        expect(DockerStateRepository.findReusableCheck(target)).toBeUndefined();
    });

    it("leaves an answer without a remote digest to the full check", () => {
        store({ remoteDigest: null });
        expect(DockerStateRepository.findReusableCheck(target)).toBeUndefined();
    });

    it("reads the answer for the same local index and platform only", () => {
        store();
        expect(DockerStateRepository.findReusableCheck({ ...target, repoDigests: ["nginx@sha256:other"] })).toBeUndefined();
        expect(
            DockerStateRepository.findReusableCheck({ ...target, platform: { os: "linux", architecture: "arm64" } }),
        ).toBeUndefined();
    });
});
