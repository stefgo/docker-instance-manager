import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
    ClientViewSchema,
    DockerStateSchema,
    ProjectQueryConflictSchema,
    SchedulerStatusResponseSchema,
    SchedulerStatusUpdateSchema,
    SchedulerStatusesSchema,
    WebhookViewSchema,
} from "./responses.js";
import type { ProjectQueryConflict } from "./projectQuery.js";
import type { SchedulerStatuses, SchedulerStatusUpdate, Webhook } from "./types.js";

const container = {
    id: "c1",
    names: ["/web"],
    image: "nginx:1",
    imageId: "sha256:aa",
    command: "nginx",
    created: 1,
    state: "running",
    ports: [{ privatePort: 80, type: "tcp" }],
    labels: {},
};

const state = { containers: [container], images: [], volumes: [], networks: [], updatedAt: "2026-10-04T08:00:00Z" };

const idle = { isRunning: false, nextRun: null, lastRun: null };

describe("types that are written by hand next to their schema", () => {
    // The schedulers are generic over their id, which a schema cannot be inferred into.
    it("agree with what the schema parses", () => {
        expectTypeOf<z.infer<typeof SchedulerStatusesSchema>>().toEqualTypeOf<SchedulerStatuses>();
        expectTypeOf<z.infer<typeof SchedulerStatusUpdateSchema>>().toEqualTypeOf<SchedulerStatusUpdate>();
        expectTypeOf<z.infer<typeof WebhookViewSchema>>().toEqualTypeOf<Webhook>();
        expectTypeOf<z.infer<typeof ProjectQueryConflictSchema>>().toEqualTypeOf<ProjectQueryConflict>();
    });
});

describe("ClientViewSchema", () => {
    const row = {
        id: "c1",
        hostname: "host",
        displayName: null,
        status: "offline",
        lastSeen: null,
        version: null,
        connectionMode: "inbound",
        inboundAllowedIp: null,
        inboundLastIp: null,
        outboundTargetAddress: null,
        autoUpdateCron: null,
        timezone: null,
        capabilities: null,
        createdAt: "2026-10-04 08:00:00",
        updatedAt: null,
    };

    // A client that never connected: every nullable column is null, not missing.
    it("accepts a row whose nullable columns are null", () => {
        expect(ClientViewSchema.safeParse(row).success).toBe(true);
    });

    it("refuses a status it does not know", () => {
        expect(ClientViewSchema.safeParse({ ...row, status: "asleep" }).success).toBe(false);
    });
});

describe("DockerStateSchema", () => {
    it("accepts a state", () => {
        expect(DockerStateSchema.parse(state)).toEqual(state);
    });

    it("drops what a newer agent reports in addition", () => {
        const parsed = DockerStateSchema.parse({
            ...state,
            containers: [{ ...container, restartCount: 3 }],
            swarm: true,
        });
        expect(parsed).toEqual(state);
    });

    it("reads a health status it does not know as none", () => {
        const parsed = DockerStateSchema.parse({ ...state, containers: [{ ...container, health: "dormant" }] });
        expect(parsed.containers[0].health).toBeUndefined();
    });

    it("refuses a container without an id", () => {
        const nameless = { ...container, id: undefined };
        expect(DockerStateSchema.safeParse({ ...state, containers: [nameless] }).success).toBe(false);
    });
});

describe("the scheduler status", () => {
    const schedulers = {
        "image-update-check": { ...idle, registries: [] },
        "image-cache-cleanup": idle,
        "notification-cleanup": idle,
        "token-cleanup": idle,
    };

    it("accepts every scheduler idle", () => {
        expect(SchedulerStatusResponseSchema.safeParse({ schedulers }).success).toBe(true);
    });

    it("refuses an answer that lacks a scheduler", () => {
        const rest = { ...schedulers, "token-cleanup": undefined };
        expect(SchedulerStatusResponseSchema.safeParse({ schedulers: rest }).success).toBe(false);
    });

    // scheduler_state keeps what an earlier version wrote.
    it("reads a result of another shape as no result", () => {
        const lastRun = {
            trigger: "schedule",
            status: "success",
            startedAt: "2026-10-04T08:00:00Z",
            finishedAt: "2026-10-04T08:00:01Z",
            result: { deleted: 3 },
            error: null,
        };
        const parsed = SchedulerStatusUpdateSchema.parse({
            scheduler: "token-cleanup",
            status: { ...idle, lastRun },
        });
        expect(parsed.status.lastRun?.result).toBeNull();
    });

    it("refuses an update for a scheduler it does not know", () => {
        expect(SchedulerStatusUpdateSchema.safeParse({ scheduler: "backup", status: idle }).success).toBe(false);
    });
});
