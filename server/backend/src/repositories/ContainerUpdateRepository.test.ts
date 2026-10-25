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
import { ContainerUpdateRepository, type StoredContainerUpdate } from "./ContainerUpdateRepository.js";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const update = (id: string, occurredAt: string, over: Partial<StoredContainerUpdate> = {}): StoredContainerUpdate => ({
    id,
    clientId: "h1",
    occurredAt,
    containerName: "web",
    containerId: "c2",
    imageRef: "nginx:1.27",
    fromImageId: "sha256:old",
    toImageId: "sha256:new",
    fromVersion: "1.27.2",
    toVersion: "1.27.3",
    trigger: "auto",
    result: "updated",
    correlationId: "run-1",
    projectIds: [],
    ...over,
});

beforeEach(() => {
    db.exec("DELETE FROM container_updates; DELETE FROM clients;");
    db.prepare("INSERT INTO clients (id, hostname) VALUES ('h1', 'host-1')").run();
});

describe("ContainerUpdateRepository.insertMany", () => {
    it("stores an update and gives it back as the dashboards read it", () => {
        const { storedIds, inserted } = ContainerUpdateRepository.insertMany(
            [update("u1", daysAgo(0), { projectIds: ["p1"] })],
            "2026-10-25T10:00:00.000Z",
        );
        expect(storedIds).toEqual(["u1"]);
        expect(inserted).toEqual([
            {
                id: "u1",
                clientId: "h1",
                occurredAt: expect.any(String),
                receivedAt: "2026-10-25T10:00:00.000Z",
                containerName: "web",
                containerId: "c2",
                imageRef: "nginx:1.27",
                fromImageRef: null,
                fromImageId: "sha256:old",
                toImageId: "sha256:new",
                fromDigest: null,
                toDigest: null,
                fromVersion: "1.27.2",
                toVersion: "1.27.3",
                trigger: "auto",
                result: "updated",
                error: null,
                correlationId: "run-1",
                projectIds: ["p1"],
            },
        ]);
    });

    // Delivery is at-least-once: the agent offers what it has not had acknowledged again.
    it("acknowledges a repeat without storing or announcing it twice", () => {
        ContainerUpdateRepository.insertMany([update("u1", daysAgo(0))], daysAgo(0));
        const again = ContainerUpdateRepository.insertMany([update("u1", daysAgo(0))], daysAgo(0));
        expect(again).toEqual({ storedIds: ["u1"], inserted: [] });
        expect(ContainerUpdateRepository.list()).toHaveLength(1);
    });
});

describe("ContainerUpdateRepository.list", () => {
    it("is newest first by when the update happened, not when it arrived", () => {
        ContainerUpdateRepository.insertMany([update("late", daysAgo(2))], daysAgo(0));
        ContainerUpdateRepository.insertMany([update("new", daysAgo(1))], daysAgo(1));
        expect(ContainerUpdateRepository.list().map((u) => u.id)).toEqual(["new", "late"]);
    });

    it("goes with its client", () => {
        ContainerUpdateRepository.insertMany([update("u1", daysAgo(0))], daysAgo(0));
        db.pragma("foreign_keys = ON");
        db.prepare("DELETE FROM clients WHERE id = 'h1'").run();
        db.pragma("foreign_keys = OFF");
        expect(ContainerUpdateRepository.list()).toEqual([]);
    });
});

describe("ContainerUpdateRepository.cleanupOld", () => {
    it("removes what is older than the retention, keeping the most recent ones", () => {
        ContainerUpdateRepository.insertMany(
            [update("a", daysAgo(400)), update("b", daysAgo(380)), update("c", daysAgo(10))],
            daysAgo(0),
        );
        expect(ContainerUpdateRepository.cleanupOld(365, 2)).toBe(1);
        expect(ContainerUpdateRepository.list().map((u) => u.id)).toEqual(["c", "b"]);
    });
});
