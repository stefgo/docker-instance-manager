import { describe, expect, it } from "vitest";
import type { Client, ContainerUpdateRecord } from "@dim/shared";
import {
    NO_FILTERS,
    clientsWithoutHistory,
    formatVersionChange,
    isFiltered,
    matchesFilters,
    matchesSearch,
    resultFilterOf,
    shortId,
    triggerFilterOf,
    versionChange,
} from "./updateHistory";

const update = (over: Partial<ContainerUpdateRecord> = {}): ContainerUpdateRecord => ({
    id: "u1",
    clientId: "c1",
    occurredAt: "2026-10-25T09:00:00.000Z",
    receivedAt: "2026-10-25T09:00:01.000Z",
    containerName: "web",
    containerId: "abc",
    imageRef: "nginx:1.27",
    fromImageRef: null,
    fromImageId: "sha256:0123456789abcdef",
    toImageId: "sha256:fedcba9876543210",
    fromDigest: "sha256:aaaaaaaaaaaaaaaa",
    toDigest: "sha256:bbbbbbbbbbbbbbbb",
    fromVersion: "1.27.2",
    toVersion: "1.27.3",
    trigger: "auto",
    result: "updated",
    error: null,
    correlationId: null,
    projectIds: [],
    ...over,
});

describe("shortId", () => {
    it("drops the algorithm and keeps twelve characters", () => {
        expect(shortId("sha256:0123456789abcdef")).toBe("0123456789ab");
        expect(shortId("0123")).toBe("0123");
        expect(shortId(null)).toBeNull();
    });
});

describe("versionChange", () => {
    it("names the versions where both images carry one", () => {
        expect(versionChange(update())).toEqual({ from: "1.27.2", to: "1.27.3" });
    });

    it("names the tags where the tag changed", () => {
        expect(versionChange(update({ fromImageRef: "nginx:1.26" }))).toEqual({ from: "nginx:1.26", to: "nginx:1.27" });
    });

    // A version on one side and a digest on the other could not be read against each other.
    it("falls back to the digests, then the ids, where one side has no version", () => {
        expect(versionChange(update({ toVersion: null }))).toEqual({ from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb" });
        expect(versionChange(update({ toVersion: null, toDigest: null }))).toEqual({
            from: "0123456789ab",
            to: "fedcba987654",
        });
    });

    // A rebuild of the same release keeps its label; only the digest tells the two apart.
    it("names the digests where the version stayed the same", () => {
        expect(versionChange(update({ toVersion: "1.27.2" }))).toEqual({ from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb" });
        expect(versionChange(update({ toVersion: "1.27.2", toDigest: "sha256:aaaaaaaaaaaaaaaa" }))).toEqual({
            from: "0123456789ab",
            to: "fedcba987654",
        });
    });

    it("names the versions where nothing else differs either", () => {
        const same = update({
            toVersion: "1.27.2",
            toDigest: "sha256:aaaaaaaaaaaaaaaa",
            toImageId: "sha256:0123456789abcdef",
        });
        expect(versionChange(same)).toEqual({ from: "1.27.2", to: "1.27.2" });
    });

    it("names only what a failed update ran", () => {
        const failed = update({ result: "failed", toVersion: null, toDigest: null, toImageId: null });
        expect(versionChange(failed)).toEqual({ from: "1.27.2", to: null });
    });

    it("names the new side alone where nothing is known of the old one", () => {
        const fresh = update({ fromVersion: null, fromDigest: null, fromImageId: null });
        expect(versionChange(fresh)).toEqual({ from: null, to: "1.27.3" });
    });
});

describe("formatVersionChange", () => {
    it("joins both sides, or names the one there is", () => {
        expect(formatVersionChange({ from: "1", to: "2" })).toBe("1 → 2");
        expect(formatVersionChange({ from: "1", to: null })).toBe("1");
        expect(formatVersionChange({ from: null, to: null })).toBe("");
    });
});

describe("the filters", () => {
    it("let everything through by default", () => {
        expect(isFiltered(NO_FILTERS)).toBe(false);
        expect(matchesFilters(update(), NO_FILTERS)).toBe(true);
    });

    it("narrow by trigger and result", () => {
        expect(matchesFilters(update(), { ...NO_FILTERS, trigger: "manual" })).toBe(false);
        expect(matchesFilters(update(), { ...NO_FILTERS, result: "failed" })).toBe(false);
        expect(matchesFilters(update(), { trigger: "auto", result: "updated" })).toBe(true);
    });

    it("read a value from the address, and nothing they do not know", () => {
        expect(triggerFilterOf("external")).toBe("external");
        expect(triggerFilterOf("sometimes")).toBe("all");
        expect(resultFilterOf("failed")).toBe("failed");
        expect(resultFilterOf(null)).toBe("all");
    });
});

describe("matchesSearch", () => {
    it("finds an update by container, image, version, host and error", () => {
        const failed = update({ result: "failed", error: "pull access denied" });
        for (const query of ["WEB", "nginx", "1.27.3", "docker-01", "denied"]) {
            expect(matchesSearch(failed, query, "docker-01")).toBe(true);
        }
        expect(matchesSearch(update(), "postgres", "docker-01")).toBe(false);
    });
});

describe("clientsWithoutHistory", () => {
    const client = (id: string, status: string, capabilities: string[] | null): Client =>
        ({ id, hostname: id, status, capabilities }) as Client;

    it("names the connected clients whose agent does not report updates", () => {
        const clients = [
            client("new", "online", ["auto-update", "update-history"]),
            client("old", "online", ["auto-update"]),
            client("away", "offline", null),
        ];
        expect(clientsWithoutHistory(clients).map((c) => c.id)).toEqual(["old"]);
    });
});
