import { describe, expect, it } from "vitest";
import {
    DEFAULT_WEBHOOK_TEMPLATE,
    SAMPLE_WEBHOOK_CLIENT,
    buildWebhookContext,
    placeholderError,
    renderTemplate,
    sampleProjectName,
    sampleWebhookRecord,
    webhookAccepts,
    webhookTemplateError,
} from "./webhookTemplate.js";

describe("the roots of a webhook template", () => {
    // The grammar is tested where it lives, in @stefgo/js-template-engine. What is decided
    // here is what a path may start with.
    it("reads the event, the client and the webhook", () => {
        expect(webhookTemplateError('{"text": "{{event.kind}} {{client.name}} {{webhook.name}}"}')).toBeNull();
        expect(placeholderError(["https://example.org/{{client.id}}", "Bearer {{webhook.name}}"])).toBeNull();
    });

    it("refuses a path that starts with anything else", () => {
        expect(webhookTemplateError('{"text": "{{host.name}}"}')).toBe(
            'text: "{{host.name}}": a path starts with event, client, webhook',
        );
        expect(placeholderError("{{host.name}}")).toBe('"{{host.name}}": a path starts with event, client, webhook');
    });
});

describe("buildWebhookContext", () => {
    const record = sampleWebhookRecord();

    it("names the client by display name, else hostname, else id", () => {
        const name = (displayName: string | null, hostname: string | null) =>
            buildWebhookContext(record, { id: "c1", displayName, hostname }, "Chat").client?.name;
        expect(name("Web", "web01")).toBe("Web");
        expect(name(null, "web01")).toBe("web01");
        expect(name("", "web01")).toBe("web01");
        expect(name(null, null)).toBe("c1");
    });

    it("has no client for an event the server reported about itself", () => {
        expect(buildWebhookContext(record, null, "Chat").client).toBeNull();
    });

    it("carries the webhook's name, the event and its wording", () => {
        const built = buildWebhookContext(record, SAMPLE_WEBHOOK_CLIENT, "Chat");
        expect(built.webhook).toEqual({ name: "Chat" });
        expect(built.event).toMatchObject({
            id: record.id,
            kind: "container.died",
            level: "warning",
            data: { exitCode: 1 },
            message: "Container nextcloud-app exited with code 1",
            detail: null,
        });
    });

    it("turns what an event leaves out into null", () => {
        const bare = { ...record, correlationId: undefined, subject: undefined, data: undefined };
        expect(buildWebhookContext(bare, null, "Chat").event).toMatchObject({
            correlationId: null,
            subject: null,
            data: null,
            projects: [],
        });
    });

    it("names the projects of the event as they are called at delivery", () => {
        const built = buildWebhookContext(record, SAMPLE_WEBHOOK_CLIENT, "Chat", sampleProjectName);
        expect(built.event.projects).toEqual([{ id: record.subject?.projectIds?.[0], name: "nextcloud" }]);
    });

    it("keeps the id of a project since deleted, with no name", () => {
        const built = buildWebhookContext(record, SAMPLE_WEBHOOK_CLIENT, "Chat");
        expect(built.event.projects).toEqual([{ id: record.subject?.projectIds?.[0], name: null }]);
    });
});

describe("webhookAccepts", () => {
    it("lets through a level at or above the minimum", () => {
        const accepts = (level: "trace" | "info" | "warning" | "error") =>
            webhookAccepts({ minLevel: "warning", kinds: [] }, { kind: "container.died", level });
        expect(accepts("trace")).toBe(false);
        expect(accepts("info")).toBe(false);
        expect(accepts("warning")).toBe(true);
        expect(accepts("error")).toBe(true);
    });

    it("lets every kind through when none is named", () => {
        expect(webhookAccepts({ minLevel: "trace", kinds: [] }, { kind: "client.connected", level: "trace" })).toBe(
            true,
        );
    });

    it("needs one of the kinds to match", () => {
        const filter = { minLevel: "trace" as const, kinds: ["client.*", "container.died"] };
        expect(webhookAccepts(filter, { kind: "container.died", level: "warning" })).toBe(true);
        expect(webhookAccepts(filter, { kind: "client.disconnected", level: "trace" })).toBe(true);
        expect(webhookAccepts(filter, { kind: "container.started", level: "info" })).toBe(false);
    });

    it("needs both the level and the kind", () => {
        expect(
            webhookAccepts(
                { minLevel: "error", kinds: ["container.*"] },
                { kind: "container.died", level: "warning" },
            ),
        ).toBe(false);
    });
});

const SAMPLE_KINDS = [
    "container.died",
    "container.oom",
    "container.health",
    "autoupdate.run",
    "action.failed",
    "client.disconnected",
];

describe("sampleWebhookRecord", () => {
    it("is a container that exited unless a kind asks for something else", () => {
        expect(sampleWebhookRecord().kind).toBe("container.died");
        expect(sampleWebhookRecord([]).kind).toBe("container.died");
        expect(sampleWebhookRecord(["no.such.kind"]).kind).toBe("container.died");
    });

    it("is the first sample one of the kinds matches", () => {
        for (const kind of SAMPLE_KINDS) expect(sampleWebhookRecord([kind]).kind).toBe(kind);
        expect(sampleWebhookRecord(["container.*"]).kind).toBe("container.died");
        expect(sampleWebhookRecord(["client.*"]).kind).toBe("client.disconnected");
        // The order is the samples', not the webhook's.
        expect(sampleWebhookRecord(["client.*", "container.oom"]).kind).toBe("container.oom");
    });

    it("has a name for every project a sample is about", () => {
        for (const kind of SAMPLE_KINDS) {
            for (const id of sampleWebhookRecord([kind]).subject?.projectIds ?? []) {
                expect(sampleProjectName(id)).not.toBeNull();
            }
        }
        expect(sampleProjectName("no-such-project")).toBeNull();
    });
});

describe("the containers of an auto-update run", () => {
    // The template of the webhook guide's "Auto-update runs" example.
    const lines = (result: string, line: string) => ({
        $join: { $map: "event.data.containers", "each(c)": { $if: `c.result == '${result}'`, then: line } },
        with: "\n",
    });
    const template = {
        updated: { $if: "event.data.updated", then: lines("updated", "- {{c.containerName}} ({{c.imageRef}})") },
        failed: {
            $if: "event.data.failed",
            then: lines("failed", "- {{c.containerName}} ({{c.imageRef}}): {{c.error}}"),
        },
    };
    const render = (data: Record<string, unknown>) => {
        const record = { ...sampleWebhookRecord(["autoupdate.run"]), data };
        return renderTemplate(template, buildWebhookContext(record, SAMPLE_WEBHOOK_CLIENT, "Chat", sampleProjectName));
    };

    it("is one line per container, by result", () => {
        const record = sampleWebhookRecord(["autoupdate.run"]);
        expect(render(record.data ?? {})).toEqual({
            updated: "- grafana (grafana/grafana:latest)",
            failed: "- prometheus (prom/prometheus:latest): pull access denied for prom/prometheus",
        });
    });

    it("counts what the sample lists", () => {
        const data = sampleWebhookRecord(["autoupdate.run"]).data ?? {};
        const containers = data.containers as { result: string }[];
        expect(containers.filter((c) => c.result === "updated")).toHaveLength(data.updated as number);
        expect(containers.filter((c) => c.result === "failed")).toHaveLength(data.failed as number);
    });

    it("leaves a key out when the run has nothing for it", () => {
        expect(render({ updated: 1, failed: 0, containers: [{ containerName: "web", imageRef: "nginx", result: "updated" }] }))
            .toEqual({ updated: "- web (nginx)" });
    });

    it("renders nothing for a run of an agent that sends no list", () => {
        expect(render({ updated: 2, failed: 0 })).toEqual({ updated: "" });
    });
});

describe("DEFAULT_WEBHOOK_TEMPLATE", () => {
    it("compiles", () => {
        expect(webhookTemplateError(DEFAULT_WEBHOOK_TEMPLATE)).toBeNull();
    });

    it.each(SAMPLE_KINDS)("renders the %s sample", (kind) => {
        const record = sampleWebhookRecord([kind]);
        const context = buildWebhookContext(record, SAMPLE_WEBHOOK_CLIENT, "Chat", sampleProjectName);
        const body = renderTemplate(JSON.parse(DEFAULT_WEBHOOK_TEMPLATE), context);
        expect(body).toMatchObject({ text: expect.stringContaining(context.event.message), kind });
    });

    it("says \"server\" where an event has no client", () => {
        const record = sampleWebhookRecord(["client.disconnected"]);
        const body = renderTemplate(JSON.parse(DEFAULT_WEBHOOK_TEMPLATE), buildWebhookContext(record, null, "Chat"));
        expect(body).toMatchObject({ text: "[trace] server: docker-01 disconnected" });
    });
});
