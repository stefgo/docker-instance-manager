import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { paths } from "../../../lib/paths";
import { activityLinks } from "./activityLinks";

const event = (over: Partial<ActivityRecord> = {}): ActivityRecord => ({
    id: "e",
    kind: "container.started",
    occurredAt: "2026-01-01T00:00:00.000Z",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "agent",
    clientId: "h1",
    level: "info",
    seen: true,
    ...over,
});

const known = new Set(["h1"]);

describe("activityLinks", () => {
    it("links the host, and the container and the image on that host", () => {
        const links = activityLinks(
            event({ subject: { containerName: "web", imageRef: "ghcr.io/acme/web:1" } }),
            known,
        );
        expect(links).toEqual({
            client: paths.client("h1"),
            container: paths.containerInstance("h1", "web"),
            image: paths.imageInstance("h1", "ghcr.io/acme/web:1"),
        });
    });

    it("links nothing on a host that is no longer known", () => {
        const links = activityLinks(event({ clientId: "gone", subject: { containerName: "web" } }), known);
        expect(links).toEqual({});
    });

    it("links nothing per host for an event of the server", () => {
        expect(activityLinks(event({ clientId: null, source: "server" }), known)).toEqual({});
    });

    it("links the project the agent names", () => {
        const links = activityLinks(event({ clientId: null, subject: { projectName: "dim", projectId: "p1" } }), known);
        expect(links).toEqual({ project: paths.project("p1") });
    });

    it("links the one project the server entered", () => {
        const links = activityLinks(event({ clientId: null, subject: { projectIds: ["p1"] } }), known);
        expect(links.project).toBe(paths.project("p1"));
    });

    it("leaves the project unlinked where the event is about several", () => {
        const links = activityLinks(event({ clientId: null, subject: { projectIds: ["p1", "p2"] } }), known);
        expect(links.project).toBeUndefined();
    });
});
