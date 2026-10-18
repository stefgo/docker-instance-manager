import { describe, expect, it } from "vitest";
import { mapDockerEvent } from "./DockerEventMapper.js";

const container = (action: string, attributes: Record<string, string> = {}) => ({
    Type: "container",
    Action: action,
    timeNano: Date.UTC(2026, 0, 1) * 1_000_000,
    Actor: { ID: "abc123", Attributes: { name: "web", image: "nginx:1", ...attributes } },
});

describe("mapDockerEvent: containers", () => {
    it("reports a kill with its signal, as bookkeeping", () => {
        expect(mapDockerEvent(container("kill", { signal: "15" }))).toEqual({
            kind: "container.killed",
            level: "trace",
            occurredAt: "2026-01-01T00:00:00.000Z",
            subject: { containerName: "web", containerId: "abc123", imageRef: "nginx:1" },
            data: { signal: 15 },
        });
    });

    it("keeps a signal Docker names rather than numbers, and goes without one", () => {
        expect(mapDockerEvent(container("kill", { signal: "SIGHUP" }))?.data).toEqual({ signal: "SIGHUP" });
        expect(mapDockerEvent(container("kill"))?.data).toEqual({ signal: null });
    });

    it("rates an exit by its code", () => {
        expect(mapDockerEvent(container("die", { exitCode: "0" }))?.level).toBe("info");
        expect(mapDockerEvent(container("die", { exitCode: "143" }))?.level).toBe("warning");
    });
});
