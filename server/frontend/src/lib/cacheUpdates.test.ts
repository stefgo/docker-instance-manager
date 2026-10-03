import { describe, expect, it } from "vitest";
import type { ActivityRecord, DockerImage, DockerState, SchedulerStatuses } from "@dim/shared";
import {
    appendActivity,
    applyImageCheck,
    applySchedulerUpdate,
    carryUpdateChecks,
    markActivitySeen,
    newerState,
    unmarkActivitySeen,
    unseenAmong,
} from "./cacheUpdates";

const NOW = "2026-10-04T09:00:00.000Z";
const AMD = { os: "linux", architecture: "amd64" };
const ARM = { os: "linux", architecture: "arm64" };

const image = (over: Partial<DockerImage> = {}): DockerImage => ({
    id: "sha256:aa",
    parentId: "",
    repoTags: ["nginx:1"],
    repoDigests: ["nginx@sha256:old"],
    created: 1,
    size: 1,
    labels: null,
    platform: AMD,
    ...over,
});

const state = (images: DockerImage[], updatedAt = "2026-10-04T08:00:00.000Z"): DockerState => ({
    containers: [],
    images,
    volumes: [],
    networks: [],
    updatedAt,
});

const check = { hasUpdate: true, remoteDigest: "sha256:new", checkedAt: "2026-10-04T07:00:00.000Z" };

describe("carryUpdateChecks", () => {
    it("returns the new state as it is when nothing is cached", () => {
        const next = state([image()]);
        expect(carryUpdateChecks(undefined, next, NOW)).toBe(next);
    });

    it("keeps the answer of an image whose digests did not change", () => {
        const previous = state([image({ updateCheck: check })]);
        const carried = carryUpdateChecks(previous, state([image()]), NOW);
        expect(carried.images[0].updateCheck).toEqual(check);
    });

    it("leaves an answer the new state brings itself alone", () => {
        const fresh = { hasUpdate: false, remoteDigest: "sha256:old", checkedAt: NOW };
        const previous = state([image({ updateCheck: check })]);
        const next = state([image({ updateCheck: fresh })]);
        expect(carryUpdateChecks(previous, next, NOW)).toBe(next);
    });

    // After a pull the local digest is the one the registry was said to hold.
    it("reads an image that now has the remote digest as current", () => {
        const previous = state([image({ updateCheck: check })]);
        const pulled = image({ id: "sha256:bb", repoDigests: ["nginx@sha256:new"] });
        const carried = carryUpdateChecks(previous, state([pulled]), NOW);
        expect(carried.images[0].updateCheck).toEqual({
            hasUpdate: false,
            remoteDigest: "sha256:new",
            checkedAt: NOW,
        });
    });

    it("drops an answer that was about another image", () => {
        const previous = state([image({ updateCheck: check })]);
        const next = state([image({ repoDigests: ["nginx@sha256:elsewhere"] })]);
        const carried = carryUpdateChecks(previous, next, NOW);
        expect(carried).toBe(next);
        expect(carried.images[0].updateCheck).toBeUndefined();
    });

    it("does not carry an answer across platforms", () => {
        const previous = state([image({ platform: ARM, updateCheck: check })]);
        const next = state([image({ platform: AMD })]);
        expect(carryUpdateChecks(previous, next, NOW).images[0].updateCheck).toBeUndefined();
    });

    it("does not carry an answer to another tag", () => {
        const previous = state([image({ updateCheck: check })]);
        const next = state([image({ repoTags: ["nginx:2"] })]);
        expect(carryUpdateChecks(previous, next, NOW).images[0].updateCheck).toBeUndefined();
    });

    it("treats an image without a platform as one platform", () => {
        const previous = state([image({ platform: undefined, updateCheck: check })]);
        const next = state([image({ platform: undefined })]);
        expect(carryUpdateChecks(previous, next, NOW).images[0].updateCheck).toEqual(check);
    });
});

describe("applyImageCheck", () => {
    const result = { clientId: "c1", platform: AMD, hasUpdate: true, remoteDigest: "sha256:new" };

    it("writes the answer onto the image it was asked about", () => {
        const applied = applyImageCheck(
            state([image()]),
            { imageRef: "nginx:1", repoDigests: ["nginx@sha256:old"] },
            result,
            NOW,
        );
        expect(applied.images[0].updateCheck).toEqual({ hasUpdate: true, remoteDigest: "sha256:new", checkedAt: NOW });
    });

    it("finds the image by its tag when no digest was given", () => {
        const applied = applyImageCheck(state([image()]), { imageRef: "nginx:1", repoDigests: [] }, result, NOW);
        expect(applied.images[0].updateCheck?.hasUpdate).toBe(true);
    });

    it("keeps the registry's error with the answer", () => {
        const applied = applyImageCheck(
            state([image()]),
            { imageRef: "nginx:1", repoDigests: [] },
            { ...result, hasUpdate: false, remoteDigest: null, error: "rate limited" },
            NOW,
        );
        expect(applied.images[0].updateCheck).toMatchObject({ hasUpdate: false, error: "rate limited" });
    });

    it("leaves the same tag on another platform alone", () => {
        const before = state([image({ platform: ARM })]);
        expect(applyImageCheck(before, { imageRef: "nginx:1", repoDigests: [] }, result, NOW)).toBe(before);
    });

    it("leaves an image with another digest alone", () => {
        const before = state([image({ repoDigests: ["nginx@sha256:other"] })]);
        const target = { imageRef: "nginx:1", repoDigests: ["nginx@sha256:old"] };
        expect(applyImageCheck(before, target, result, NOW)).toBe(before);
    });
});

describe("newerState", () => {
    const older = state([], "2026-10-04T08:00:00.000Z");
    const newer = state([], "2026-10-04T08:00:05.000Z");

    it("takes the fetched state when nothing is cached", () => {
        expect(newerState(undefined, older)).toBe(older);
    });

    it("takes the fetched state when it is the later one", () => {
        expect(newerState(older, newer)).toBe(newer);
    });

    // The socket delivered while the request was under way.
    it("keeps the cached state when the fetched one is older", () => {
        expect(newerState(newer, older)).toBe(newer);
    });
});

const event = (id: string, occurredAt: string, seen = false): ActivityRecord => ({
    id,
    occurredAt,
    receivedAt: occurredAt,
    source: "agent",
    kind: "container.started",
    level: "info",
    seen,
});

describe("appendActivity", () => {
    const list = [event("b", "2026-10-04T08:00:00Z"), event("a", "2026-10-04T07:00:00Z")];

    it("puts a new event where it happened, not on top", () => {
        const late = event("late", "2026-10-04T07:30:00Z");
        expect(appendActivity(list, [late]).map((e) => e.id)).toEqual(["b", "late", "a"]);
    });

    it("skips an event it already holds", () => {
        expect(appendActivity(list, [event("a", "2026-10-04T07:00:00Z")])).toBe(list);
    });

    it("adds only the new ones of a batch", () => {
        const batch = [event("a", "2026-10-04T07:00:00Z"), event("c", "2026-10-04T09:00:00Z")];
        expect(appendActivity(list, batch).map((e) => e.id)).toEqual(["c", "b", "a"]);
    });
});

describe("marking activity seen", () => {
    const list = [event("a", "2026-10-04T08:00:00Z"), event("b", "2026-10-04T07:00:00Z", true)];

    it("turns the named events seen", () => {
        expect(markActivitySeen(list, ["a"]).map((e) => e.seen)).toEqual([true, true]);
    });

    it("returns the list itself when nothing changes", () => {
        expect(markActivitySeen(list, ["b", "gone"])).toBe(list);
    });

    it("names what a marking will change", () => {
        expect(unseenAmong(list, ["a", "b", "gone"])).toEqual(["a"]);
    });

    // Only what the failed request had turned seen goes back, not what was seen before.
    it("takes back exactly what was marked", () => {
        const marked = markActivitySeen(list, ["a", "b"]);
        const undone = unmarkActivitySeen(marked, unseenAmong(list, ["a", "b"]));
        expect(undone.map((e) => e.seen)).toEqual([false, true]);
    });
});

describe("applySchedulerUpdate", () => {
    const idle = { isRunning: false, nextRun: null, lastRun: null };
    const schedulers: SchedulerStatuses = {
        "image-update-check": { ...idle, registries: [] },
        "image-cache-cleanup": idle,
        "notification-cleanup": idle,
        "token-cleanup": idle,
    };

    it("replaces the one scheduler and leaves the others", () => {
        const updated = applySchedulerUpdate(schedulers, {
            scheduler: "token-cleanup",
            status: { ...idle, isRunning: true },
        });
        expect(updated["token-cleanup"].isRunning).toBe(true);
        expect(updated["image-cache-cleanup"]).toBe(schedulers["image-cache-cleanup"]);
    });
});
