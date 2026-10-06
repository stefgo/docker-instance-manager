import { describe, expect, it } from "vitest";
import { activityDetail, activityMessage } from "./activityText.js";
import type { ActivityRecord } from "./types.js";

const event = (kind: string, over: Partial<ActivityRecord> = {}): ActivityRecord => ({
    id: "e1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    receivedAt: "2026-01-01T00:00:01.000Z",
    source: "agent",
    clientId: "h1",
    kind,
    level: "info",
    seen: false,
    ...over,
});

const web = { containerName: "web", containerId: "0123456789abcdef0123" };

describe("activityMessage: containers", () => {
    it("names the container", () => {
        expect(activityMessage(event("container.started", { subject: web }))).toBe("Container web started");
    });

    it("falls back to the short id, then to a generic word", () => {
        const idOnly = { containerId: "0123456789abcdef0123" };
        expect(activityMessage(event("container.stopped", { subject: idOnly }))).toBe(
            "Container 0123456789ab stopped",
        );
        expect(activityMessage(event("container.removed"))).toBe("Container a container removed");
    });

    it("tells a normal exit from a failed one, and from one without a code", () => {
        const died = (data: ActivityRecord["data"]) => activityMessage(event("container.died", { subject: web, data }));
        expect(died({ exitCode: 0 })).toBe("Container web exited normally");
        expect(died({ exitCode: 137 })).toBe("Container web exited with code 137");
        // Stopped by the operation it belongs to, and killed when the timeout ran out.
        expect(died({ exitCode: 137, requested: true })).toBe("Container web did not stop in time and was killed");
        expect(died({ exitCode: 143, requested: true })).toBe("Container web exited with code 143");
        // An agent that could not read the exit code sends none.
        expect(died(null)).toBe("Container web exited");
        expect(died({ exitCode: "1" })).toBe("Container web exited");
    });

    it("words a health change with its status", () => {
        expect(activityMessage(event("container.health", { subject: web, data: { status: "unhealthy" } }))).toBe(
            "Container web is unhealthy",
        );
        expect(activityMessage(event("container.health", { subject: web }))).toBe("Container web is unknown");
    });
});

describe("activityMessage: images and auto-update", () => {
    it("names the image, or says there is one", () => {
        expect(activityMessage(event("image.pulled", { subject: { imageRef: "nginx:1.27" } }))).toBe(
            "Image nginx:1.27 pulled",
        );
        expect(activityMessage(event("image.removed"))).toBe("Image an image removed");
    });

    it("counts the updated containers, with the plural where it belongs", () => {
        const run = (updated: unknown) => activityMessage(event("autoupdate.run", { data: { updated } }));
        expect(run(0)).toBe("Auto-update run: 0 containers updated");
        expect(run(1)).toBe("Auto-update run: 1 container updated");
        expect(run(2)).toBe("Auto-update run: 2 containers updated");
        expect(run(undefined)).toBe("Auto-update run: 0 containers updated");
    });

    it("says what happens to a container two projects claim", () => {
        const conflict = (data: ActivityRecord["data"]) =>
            activityMessage(event("autoupdate.conflict", { subject: web, data }));
        expect(conflict({ projectNames: ["a", "b"] })).toBe(
            "Container web matches a, b: excluded from auto-update",
        );
        expect(conflict({ projectNames: ["a", "b"], fallback: "host" })).toBe(
            "Container web matches a, b: updated through its label on the host schedule",
        );
        expect(conflict(null)).toBe("Container web matches several projects: excluded from auto-update");
    });

    it("words a self-update with and without the version", () => {
        expect(activityMessage(event("selfupdate.completed", { data: { toVersion: "1.5.0" } }))).toBe(
            "Agent updated itself to 1.5.0",
        );
        expect(activityMessage(event("selfupdate.completed"))).toBe("Agent updated itself");
        expect(activityMessage(event("selfupdate.rolledback", { data: { fromVersion: "1.4.0" } }))).toBe(
            "Agent self-update failed: rolled back to 1.4.0",
        );
        expect(activityMessage(event("selfupdate.rolledback"))).toBe(
            "Agent self-update failed: rolled back to the previous image",
        );
    });
});

describe("activityMessage: clients", () => {
    it("names the host, or says there is one", () => {
        expect(activityMessage(event("client.connected", { data: { clientName: "docker-01" } }))).toBe(
            "docker-01 connected",
        );
        expect(activityMessage(event("client.disconnected"))).toBe("the client disconnected");
    });

    it("prefers the hostname for a registration", () => {
        expect(
            activityMessage(event("client.registered", { data: { hostname: "docker-01.lan", clientName: "One" } })),
        ).toBe("docker-01.lan registered");
        expect(activityMessage(event("client.registered", { data: { clientName: "One" } }))).toBe("One registered");
    });
});

describe("activityMessage: actions", () => {
    it("names the target of a request: the image before the container", () => {
        const requested = (subject: ActivityRecord["subject"], data: ActivityRecord["data"] = { action: "restart" }) =>
            activityMessage(event("action.requested", { source: "server", subject, data }));
        expect(requested(web)).toBe("restart requested for web");
        expect(requested({ ...web, imageRef: "nginx:1.27" })).toBe("restart requested for nginx:1.27");
        expect(requested({ containerId: "0123456789abcdef0123" })).toBe("restart requested for 0123456789ab");
    });

    it("leaves the target out for an action without one", () => {
        expect(
            activityMessage(event("action.requested", { source: "server", data: { action: "image:prune" } })),
        ).toBe("image:prune requested");
    });

    it("marks a request the auto-update made", () => {
        expect(
            activityMessage(
                event("action.requested", { source: "server", subject: web, data: { action: "pull", autoUpdate: true } }),
            ),
        ).toBe("Auto-update: pull requested for web");
    });

    it("does not name a completed action by an id alone", () => {
        const completed = (subject: ActivityRecord["subject"]) =>
            activityMessage(event("action.completed", { subject, data: { action: "restart" } }));
        expect(completed(web)).toBe("restart completed for web");
        expect(completed({ containerId: "0123456789abcdef0123" })).toBe("restart completed");
    });

    it("names the target of a failure by id only in the server's record", () => {
        const failed = (source: ActivityRecord["source"]) =>
            activityMessage(
                event("action.failed", {
                    source,
                    subject: { containerId: "0123456789abcdef0123" },
                    data: { action: "restart", error: "boom" },
                }),
            );
        expect(failed("server")).toBe("restart failed for 0123456789ab: boom");
        expect(failed("agent")).toBe("restart failed: boom");
    });

    it("words a failure without an action or an error", () => {
        expect(activityMessage(event("action.failed"))).toBe("The action failed");
    });

    it("says why the result of an action is pending", () => {
        const unconfirmed = (reason?: string) =>
            activityMessage(
                event("action.unconfirmed", { data: { action: "restart", clientName: "docker-01", reason } }),
            );
        expect(unconfirmed("disconnected")).toBe(
            "restart sent to docker-01, result pending: the connection was lost",
        );
        expect(unconfirmed("timeout")).toBe("restart sent to docker-01, result pending: no answer in time");
        expect(unconfirmed()).toBe("restart sent to docker-01, result pending: no answer in time");
    });
});

describe("activityMessage: server", () => {
    it("words an interrupted image check with registry and pause", () => {
        const stopped = (data: ActivityRecord["data"]) =>
            activityMessage(event("imagecheck.interrupted", { source: "server", data }));
        expect(stopped({ checked: 3, total: 10, registry: "registry-1.docker.io", retryAfterSeconds: 900 })).toBe(
            "Image update check stopped at Docker Hub after 3 of 10 images, paused for 15 min",
        );
        expect(stopped({ registry: "ghcr.io" })).toBe("Image update check stopped early at ghcr.io");
    });

    it("still reads an event written before the check paused per registry", () => {
        expect(
            activityMessage(event("imagecheck.interrupted", { source: "server", data: { checked: 3, total: 10 } })),
        ).toBe("Image update check stopped after 3 of 10 images");
        expect(activityMessage(event("imagecheck.interrupted", { source: "server" }))).toBe(
            "Image update check stopped early",
        );
    });

    it("gives a pause in minutes below two hours and in hours above", () => {
        const pause = (retryAfterSeconds: number) =>
            activityMessage(event("imagecheck.interrupted", { source: "server", data: { retryAfterSeconds } }));
        expect(pause(10)).toBe("Image update check stopped early, paused for 1 min");
        expect(pause(119 * 60)).toBe("Image update check stopped early, paused for 119 min");
        expect(pause(120 * 60)).toBe("Image update check stopped early, paused for 2 h");
        expect(pause(6 * 3600)).toBe("Image update check stopped early, paused for 6 h");
    });

    it("names a scheduler as the settings page does", () => {
        const failed = (data: ActivityRecord["data"]) =>
            activityMessage(event("scheduler.failed", { source: "server", data }));
        expect(failed({ scheduler: "token-cleanup", error: "disk full" })).toBe("Token cleanup failed: disk full");
        expect(failed({ scheduler: "something-new" })).toBe("something-new failed");
        expect(failed(null)).toBe("A scheduled job failed");
    });
});

describe("activityMessage: unknown kinds", () => {
    it("prints the kind itself rather than dropping the line", () => {
        expect(activityMessage(event("container.frobnicated", { subject: web }))).toBe("container.frobnicated");
    });
});

describe("activityDetail", () => {
    it("is the error, where there is one", () => {
        expect(activityDetail(event("action.failed", { data: { error: "boom" } }))).toBe("boom");
    });

    it("names both errors of a failed rollback", () => {
        expect(
            activityDetail(event("selfupdate.failed", { data: { error: "pull failed", rollbackError: "no image" } })),
        ).toBe("pull failed; rollback: no image");
    });

    it("lists the counts of an auto-update run in a fixed order", () => {
        expect(
            activityDetail(
                event("autoupdate.run", { data: { updated: 1, eligible: 4, failed: 0, pulled: 2, skipped: 1 } }),
            ),
        ).toBe("eligible: 4, pulled: 2, updated: 1, failed: 0, skipped: 1");
    });

    it("says when a run was caught up or asked for", () => {
        expect(
            activityDetail(event("autoupdate.run", { data: { updated: 1, catchUp: true, scheduledFor: "03:00" } })),
        ).toBe("updated: 1, caught up (due 03:00)");
        expect(activityDetail(event("autoupdate.run", { data: { catchUp: true, manual: true } }))).toBe(
            "caught up, asked for",
        );
    });

    it("is null when the message already said everything", () => {
        expect(activityDetail(event("autoupdate.run", { data: {} }))).toBeNull();
        expect(activityDetail(event("container.started"))).toBeNull();
    });
});
