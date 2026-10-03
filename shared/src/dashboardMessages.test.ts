import { describe, expect, it } from "vitest";
import { WS_EVENTS } from "./constants.js";
import { DashboardMessageSchema, type DashboardMessage } from "./dashboardMessages.js";

const client = {
    id: "c1",
    hostname: "docker-host",
    status: "online",
    lastSeen: "2026-10-04 08:00:00",
};

const state = { containers: [], images: [], volumes: [], networks: [], updatedAt: "2026-10-04T08:00:00Z" };

const status = { isRunning: false, nextRun: null, lastRun: null };

const event = {
    id: "e1",
    occurredAt: "2026-10-04T08:00:00Z",
    receivedAt: "2026-10-04T08:00:01Z",
    source: "agent",
    clientId: "c1",
    kind: "container.started",
    level: "info",
    seen: false,
};

const project = {
    id: "p1",
    name: "web",
    query: [],
    autoUpdate: false,
    cron: null,
    createdAt: "2026-10-04T08:00:00Z",
    clientIds: ["c1"],
    containerCount: 2,
    imageCount: 1,
    conflictCount: 0,
};

/** One valid message per type. A type added to the union has to be added here. */
const VALID: { [T in DashboardMessage["type"]]: unknown } = {
    CLIENTS_UPDATE: { type: "CLIENTS_UPDATE", payload: [client] },
    DOCKER_STATE_UPDATE: { type: "DOCKER_STATE_UPDATE", payload: { clientId: "c1", state } },
    DOCKER_ACTION_RESULT: {
        type: "DOCKER_ACTION_RESULT",
        payload: { clientId: "c1", result: { actionId: "a1", success: false, error: "No such container" } },
    },
    SCHEDULER_STATUS_UPDATE: {
        type: "SCHEDULER_STATUS_UPDATE",
        payload: { scheduler: "token-cleanup", status },
    },
    AUTO_UPDATE_LABEL_UPDATE: { type: "AUTO_UPDATE_LABEL_UPDATE", payload: { labelFilter: "dim.auto-update=true" } },
    PROJECTS_UPDATE: { type: "PROJECTS_UPDATE", payload: { projects: [project] } },
    ACTIVITY_UPDATE: { type: "ACTIVITY_UPDATE", payload: [event] },
    ACTIVITY_APPENDED: { type: "ACTIVITY_APPENDED", payload: [event] },
    ACTIVITY_SEEN: { type: "ACTIVITY_SEEN", payload: { ids: ["e1"] } },
};

describe("DashboardMessageSchema", () => {
    it.each(Object.entries(VALID))("accepts %s", (_type, message) => {
        expect(DashboardMessageSchema.safeParse(message).success).toBe(true);
    });

    // The union's literals are the constants the backend sends with.
    it("names its types by the constants in WS_EVENTS", () => {
        for (const type of Object.keys(VALID)) {
            expect(WS_EVENTS).toHaveProperty(type, type);
        }
    });

    it("rejects a type it does not know", () => {
        expect(DashboardMessageSchema.safeParse({ type: "SOMETHING_NEW", payload: {} }).success).toBe(false);
    });

    // A message between the server and an agent is not one for a dashboard.
    it("rejects a type of the agent protocol", () => {
        expect(DashboardMessageSchema.safeParse({ type: "DOCKER_UPDATE", payload: state }).success).toBe(false);
    });

    it("rejects a message without its payload", () => {
        expect(DashboardMessageSchema.safeParse({ type: "DOCKER_STATE_UPDATE" }).success).toBe(false);
    });

    it("rejects a payload of the wrong shape", () => {
        const message = { type: "ACTIVITY_SEEN", payload: { ids: "e1" } };
        expect(DashboardMessageSchema.safeParse(message).success).toBe(false);
    });

    it("rejects a scheduler the server does not run", () => {
        const message = { type: "SCHEDULER_STATUS_UPDATE", payload: { scheduler: "backup", status } };
        expect(DashboardMessageSchema.safeParse(message).success).toBe(false);
    });

    // A row read out of SQLite carries null where the column is empty, not a missing key.
    it("accepts a client whose nullable columns are null", () => {
        const row = {
            ...client,
            displayName: null,
            lastSeen: null,
            version: null,
            timezone: null,
            outboundTargetAddress: null,
            inboundAllowedIp: null,
            capabilities: null,
            updatedAt: null,
        };
        expect(DashboardMessageSchema.safeParse({ type: "CLIENTS_UPDATE", payload: [row] }).success).toBe(true);
    });

    // An agent of another version may report a kind and a level nobody here knows yet.
    it("accepts an event of a kind it cannot phrase, and reads an unknown level as info", () => {
        const foreign = { ...event, kind: "volume.snapshotted", level: "notice" };
        const parsed = DashboardMessageSchema.parse({ type: "ACTIVITY_APPENDED", payload: [foreign] });
        expect(parsed.type === "ACTIVITY_APPENDED" && parsed.payload[0]).toMatchObject({
            kind: "volume.snapshotted",
            level: "info",
        });
    });

    it("drops a field the union does not describe", () => {
        const parsed = DashboardMessageSchema.parse({
            type: "AUTO_UPDATE_LABEL_UPDATE",
            payload: { labelFilter: "", extra: true },
            sentAt: 1,
        });
        expect(parsed).toEqual({ type: "AUTO_UPDATE_LABEL_UPDATE", payload: { labelFilter: "" } });
    });
});
