import { describe, expect, it } from "vitest";
import { buildFindings, clientCount, fleetStatus } from "./fleetFindings.js";
import type { Client, DockerContainer } from "./types.js";

// The dashboard's tests (server/frontend/src/features/dashboard/lib/findings.test.ts) check
// every finding's text through the dashboard's own `buildFindings`; these check what the
// server reads of them: where each leads, and the verdict.

const NOW = Date.parse("2026-10-25T12:00:00.000Z");

const client = (over: Partial<Client> = {}): Client =>
    ({
        id: "c1",
        hostname: "web01",
        displayName: null,
        status: "online",
        connectionMode: "inbound",
        lastSeen: "2026-10-25T11:59:00.000Z",
        capabilities: ["auto-update", "project-query", "update-history"],
        docker: { reachable: true, error: null, since: "2026-10-20T00:00:00.000Z" },
        ...over,
    }) as Client;

const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "k1",
    names: ["/app"],
    image: "app:1",
    imageId: "sha256:a",
    command: "run",
    created: 1,
    state: "running",
    ports: [],
    labels: {},
    ...over,
});

describe("buildFindings", () => {
    it("names where each finding can be dealt with, without a path of the dashboard", () => {
        const found = buildFindings({
            clients: [client(), client({ id: "c2", hostname: "db01", status: "offline" })],
            dockerStates: { c1: { containers: [container({ health: "unhealthy" })] } },
            assignment: new Map(),
            registries: [{ registry: "docker.io", pausedUntil: "2026-10-25T13:00:00.000Z" } as never],
            now: NOW,
        });
        expect(found.map((f) => [f.type, f.target])).toEqual([
            ["client-offline", { kind: "client", clientId: "c2" }],
            ["container-unhealthy", { kind: "container", clientId: "c1", name: "app" }],
            ["registry-paused", { kind: "settings" }],
        ]);
    });
});

describe("fleetStatus", () => {
    it("is unknown without a registered client, then follows the worst finding", () => {
        expect(fleetStatus([], [client({ lastSeen: null })])).toBe("unknown");
        expect(fleetStatus([], [client()])).toBe("healthy");
        expect(fleetStatus([{ severity: "warning" }], [client()])).toBe("degraded");
        expect(fleetStatus([{ severity: "error" }, { severity: "warning" }], [client()])).toBe("critical");
    });
});

describe("clientCount", () => {
    it("counts the clients online, of all", () => {
        expect(clientCount([client(), client({ status: "offline" })])).toEqual({ online: 1, total: 2 });
    });
});
