import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/AppConfig.js", () => ({
    appConfig: { secretKey: "test-secret-key", settings: {} },
    secretKeyPersisted: () => true,
}));
vi.mock("../core/Database.js", async () => {
    const { migratedMemoryDatabase } = await import("../testing/memoryDatabase.js");
    return { default: await migratedMemoryDatabase() };
});
vi.mock("./ProxyService.js", () => ({
    ProxyService: { broadcastToDashboard: vi.fn(), sendToAgent: vi.fn() },
}));
vi.mock("./ProjectService.js", () => ({
    ProjectService: {
        activityProjectResolver: () => (_clientId: string, subject: { containerName?: string }) =>
            subject.containerName === "web" ? ["p1"] : [],
    },
}));

import db from "../core/Database.js";
import { ContainerUpdateService } from "./ContainerUpdateService.js";
import { ProxyService } from "./ProxyService.js";

const update = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    occurredAt: "2026-10-25T09:00:00.000Z",
    containerName: "web",
    imageRef: "nginx:1.27",
    trigger: "external",
    result: "updated",
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    db.exec("DELETE FROM container_updates; DELETE FROM clients;");
    db.prepare("INSERT INTO clients (id, hostname) VALUES ('h1', 'host-1')").run();
});

describe("ContainerUpdateService.handleBatch", () => {
    it("stores the updates under the client the connection belongs to, with their projects", () => {
        ContainerUpdateService.handleBatch("h1", { updates: [update("u1"), update("u2", { containerName: "db" })] });
        const stored = ContainerUpdateService.list();
        expect(stored.map((u) => [u.id, u.clientId, u.projectIds])).toEqual([
            ["u1", "h1", ["p1"]],
            ["u2", "h1", []],
        ]);
        expect(ProxyService.sendToAgent).toHaveBeenCalledWith("h1", "UPDATES_ACK", { ids: ["u1", "u2"] });
    });

    it("tells the dashboards about the new updates only", () => {
        ContainerUpdateService.handleBatch("h1", { updates: [update("u1")] });
        ContainerUpdateService.handleBatch("h1", { updates: [update("u1")] });
        expect(ProxyService.broadcastToDashboard).toHaveBeenCalledTimes(1);
        expect(ProxyService.sendToAgent).toHaveBeenCalledTimes(2);
    });

    // Offered again, it would never parse either, and hold up the agent's queue for good.
    it("acknowledges an update it cannot read without storing it", () => {
        ContainerUpdateService.handleBatch("h1", { updates: [update("u1"), { id: "bad", containerName: "" }] });
        expect(ContainerUpdateService.list().map((u) => u.id)).toEqual(["u1"]);
        expect(ProxyService.sendToAgent).toHaveBeenCalledWith("h1", "UPDATES_ACK", { ids: ["u1", "bad"] });
    });

    it("acknowledges nothing of a batch it cannot read at all", () => {
        ContainerUpdateService.handleBatch("h1", { updates: "nonsense" });
        ContainerUpdateService.handleBatch("h1", { updates: [{ containerName: "web" }] });
        expect(ProxyService.sendToAgent).not.toHaveBeenCalled();
    });

    // A client deleted while its agent was still connected: nothing can be stored for it.
    it("acknowledges nothing it failed to store", () => {
        db.pragma("foreign_keys = ON");
        ContainerUpdateService.handleBatch("gone", { updates: [update("u1")] });
        db.pragma("foreign_keys = OFF");
        expect(ProxyService.sendToAgent).not.toHaveBeenCalled();
        expect(ContainerUpdateService.list()).toEqual([]);
    });
});
