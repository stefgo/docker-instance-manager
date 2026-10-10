import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@dim/shared";

// The queue is not what is tested here: nothing is read from disk and nothing written.
vi.mock("../core/DataStore.js", () => ({
    readJsonFile: () => null,
    writeJsonFile: () => true,
}));

// The service keeps its scopes and its queue in the module, so every test imports it anew.
async function freshService() {
    vi.resetModules();
    const { ActivityService } = await import("./ActivityService.js");
    const sent: ActivityEvent[] = [];
    ActivityService.setTransport((events) => {
        sent.push(...events);
        ActivityService.acknowledge(events.map((e) => e.id));
        return true;
    });
    return { ActivityService, sent };
}

const web = { containerName: "web", containerId: "abc123" };

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T01:37:43.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("an exit the operation asked for", () => {
    it("is reported as a step, not as a warning", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web", "abc123");
        scope.expectExit("abc123");

        ActivityService.report({ kind: "container.died", level: "warning", subject: web, data: { exitCode: 137 } });

        expect(sent[0]).toMatchObject({
            level: "info",
            correlationId: "action-1",
            data: { exitCode: 137, requested: true },
        });
    });

    it("covers one exit: the next one is the container's own", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web");
        scope.expectExit("web");

        ActivityService.report({ kind: "container.died", level: "warning", subject: web, data: { exitCode: 137 } });
        ActivityService.report({ kind: "container.died", level: "warning", subject: web, data: { exitCode: 1 } });

        expect(sent[1]).toMatchObject({ level: "warning", data: { exitCode: 1 } });
    });

    it("leaves an exit nobody asked for a warning", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web");

        ActivityService.report({ kind: "container.died", level: "warning", subject: web, data: { exitCode: 137 } });
        ActivityService.report({ kind: "container.died", level: "warning", subject: { containerName: "db" }, data: { exitCode: 137 } });

        expect(sent[0]).toMatchObject({ level: "warning", correlationId: "action-1", data: { exitCode: 137 } });
        expect(sent[1]).toMatchObject({ level: "warning", correlationId: null });
    });
});

describe("the time of an outcome", () => {
    it("waits for the events the operation expected", async () => {
        const { ActivityService } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web");
        scope.expect("container.started:web");

        let time: string | null = null;
        void ActivityService.settled(scope).then((t) => { time = t; });
        await vi.advanceTimersByTimeAsync(100);
        expect(time).toBeNull();

        ActivityService.report({ kind: "container.started", level: "info", subject: web });
        await vi.advanceTimersByTimeAsync(0);
        // One millisecond after the event it waited for, which was stamped on arrival.
        expect(time).toBe("2026-10-07T01:37:43.101Z");
    });

    it("lies after an event Docker stamped later than now", async () => {
        const { ActivityService } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web");

        ActivityService.report({
            kind: "container.started",
            level: "info",
            subject: web,
            occurredAt: "2026-10-07T01:37:44.250Z",
        });

        expect(await ActivityService.settled(scope)).toBe("2026-10-07T01:37:44.251Z");
    });

    it("stops waiting for an event that never comes", async () => {
        const { ActivityService } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.expect("container.started:web");

        let time: string | null = null;
        void ActivityService.settled(scope, 3000).then((t) => { time = t; });
        await vi.advanceTimersByTimeAsync(2999);
        expect(time).toBeNull();
        await vi.advanceTimersByTimeAsync(1);
        expect(time).toBe("2026-10-07T01:37:46.000Z");
    });
});

describe("an event replayed from before the operation began", () => {
    const before = "2026-10-07T01:27:43.000Z";

    it("is not a step of the operation, although it is about its container", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web", "abc123");
        scope.expectExit("abc123");

        ActivityService.report({
            kind: "container.died",
            level: "warning",
            occurredAt: before,
            subject: web,
            data: { exitCode: 1 },
        });

        expect(sent[0]).toMatchObject({ level: "warning", correlationId: null, data: { exitCode: 1 } });
    });

    it("leaves the exit the operation asked for to the one that follows", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.covers("web", "abc123");
        scope.expectExit("abc123");

        ActivityService.report({ kind: "container.died", level: "warning", occurredAt: before, subject: web });
        ActivityService.report({ kind: "container.died", level: "warning", subject: web, data: { exitCode: 137 } });

        expect(sent[1]).toMatchObject({ level: "info", correlationId: "action-1", data: { requested: true } });
    });

    it("does not answer the wait for a first health status", async () => {
        const { ActivityService, sent } = await freshService();
        const scope = ActivityService.beginScope("action-1");
        scope.expectHealth("abc123").arm();
        ActivityService.endScope(scope);

        ActivityService.report({
            kind: "container.health",
            level: "warning",
            occurredAt: before,
            subject: web,
            data: { status: "unhealthy" },
        });
        ActivityService.report({ kind: "container.health", level: "info", subject: web, data: { status: "healthy" } });

        expect(sent[0]).toMatchObject({ correlationId: null, data: { status: "unhealthy" } });
        expect(sent[1]).toMatchObject({ correlationId: "action-1", data: { status: "healthy" } });
    });
});
