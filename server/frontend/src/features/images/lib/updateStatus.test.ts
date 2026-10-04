import { describe, expect, it } from "vitest";
import type { DockerImage } from "@dim/shared";
import {
    type UpdateStatus,
    aggregateUpdateStatus,
    checkStatus,
    updateStatusBadge,
    updateStatusLabel,
    updateStatusOf,
} from "./updateStatus";

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

describe("checkStatus", () => {
    const answer = { hasUpdate: false, remoteDigest: null, checkedAt: "2026-10-03T11:00:00Z" };

    it("says nothing about what cannot be checked, whatever a check recorded", () => {
        expect(checkStatus(undefined, false)).toBe("none");
        expect(checkStatus({ ...answer, hasUpdate: true }, false)).toBe("none");
    });

    it("is unchecked without an answer, and with one that failed", () => {
        expect(checkStatus(undefined, true)).toBe("unchecked");
        expect(checkStatus({ ...answer, error: "rate limited" }, true)).toBe("unchecked");
    });

    it("reads an answer", () => {
        expect(checkStatus(answer, true)).toBe("current");
        expect(checkStatus({ ...answer, hasUpdate: true }, true)).toBe("update");
    });
});

describe("aggregateUpdateStatus", () => {
    it("takes the status that asks for the most attention", () => {
        expect(aggregateUpdateStatus([])).toBe("none");
        expect(aggregateUpdateStatus(["none", "current"])).toBe("current");
        expect(aggregateUpdateStatus(["current", "unchecked"])).toBe("unchecked");
        expect(aggregateUpdateStatus(["unchecked", "update", "current"])).toBe("update");
    });
});

describe("updateStatusLabel", () => {
    const statuses: UpdateStatus[] = ["update", "unchecked", "current", "none"];

    it("names every status differently", () => {
        const labels = statuses.map((status) => updateStatusLabel(status));
        expect(new Set(labels).size).toBe(statuses.length);
        expect(labels.every((label) => label.length > 0)).toBe(true);
    });

    it("says what an update and an image without one are", () => {
        expect(updateStatusLabel("update")).toBe("Update available");
        expect(updateStatusLabel("current")).toBe("Up to date");
    });

    it("names the work under way instead of the status it replaces", () => {
        expect(updateStatusLabel("update", { isChecking: true })).toBe("Checking for updates…");
        expect(updateStatusLabel("update", { isUpdating: true })).toBe("Updating…");
    });

    it("puts a pull before a check", () => {
        expect(updateStatusLabel("current", { isChecking: true, isUpdating: true })).toBe("Updating…");
    });
});

describe("updateStatusBadge", () => {
    it("words and colours every status that has something to say", () => {
        expect(updateStatusBadge("update")).toEqual({ label: "Update available", variant: "warning" });
        expect(updateStatusBadge("current")).toEqual({ label: "Up to date", variant: "success" });
        expect(updateStatusBadge("unchecked")).toEqual({ label: "Not checked", variant: "neutral" });
    });

    it("has no badge for what is not checked at all", () => {
        expect(updateStatusBadge("none")).toBeUndefined();
    });
});
