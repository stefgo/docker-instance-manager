import { createTemplateEngine, matchesKindPattern } from "@stefgo/js-template-engine";
import { ACTIVITY_LEVELS } from "./constants.js";
import { activityDetail, activityMessage } from "./activityText.js";
import type { ActivityLevel, ActivityRecord } from "./types.js";

export { matchesKindPattern };

/**
 * The JSON a webhook sends, written by the operator.
 *
 * The language is the one of `@stefgo/js-template-engine`: `{{path}}` placeholders, filters,
 * `$if`, `$map` and `$join`, filled in on the parsed tree, so what an event carries cannot
 * break the JSON or smuggle in keys of its own. Its README describes the grammar. What is
 * decided here is the context -- what a template can read -- and which events a webhook takes.
 *
 * The engine is free of Node, so the settings page previews a template with the same code the
 * server sends it with -- a preview that rendered differently would be worse than none.
 */

/** What a placeholder may start with. Anything else is a typo, and is refused on save. */
export const WEBHOOK_TEMPLATE_ROOTS = ["event", "client", "webhook"] as const;

export interface WebhookContext {
    event: {
        id: string;
        kind: string;
        level: ActivityLevel;
        source: string;
        occurredAt: string;
        receivedAt: string;
        correlationId: string | null;
        subject: Record<string, unknown> | null;
        data: Record<string, unknown> | null;
        /** The sentence the dashboard shows for the event. */
        message: string;
        /** The dashboard's second line, where there is one. */
        detail: string | null;
        /** `subject.projectIds` with the names they carry at delivery; null for a project since deleted. */
        projects: WebhookProjectInfo[];
    };
    /** Null for an event the server reported about nothing but itself. */
    client: {
        id: string;
        name: string;
        hostname: string | null;
    } | null;
    webhook: {
        name: string;
    };
}

/** The part of a client a template can see. */
export interface WebhookClientInfo {
    id: string;
    displayName: string | null;
    hostname: string | null;
}

/** A project an event is about, by the name it has when the event is sent. */
export interface WebhookProjectInfo {
    id: string;
    name: string | null;
}

/**
 * `projectName` looks a project up by id: the server asks its database, the preview the
 * projects the dashboard holds. A stored event keeps only the ids, so a rename shows in the
 * next delivery.
 */
export function buildWebhookContext(
    record: ActivityRecord,
    client: WebhookClientInfo | null,
    webhookName: string,
    projectName: (id: string) => string | null = () => null,
): WebhookContext {
    return {
        event: {
            id: record.id,
            kind: record.kind,
            level: record.level,
            source: record.source,
            occurredAt: record.occurredAt,
            receivedAt: record.receivedAt,
            correlationId: record.correlationId ?? null,
            subject: record.subject ?? null,
            data: record.data ?? null,
            message: activityMessage(record),
            detail: activityDetail(record),
            projects: (record.subject?.projectIds ?? []).map((id) => ({ id, name: projectName(id) })),
        },
        client: client
            ? {
                  id: client.id,
                  name: client.displayName || client.hostname || client.id,
                  hostname: client.hostname,
              }
            : null,
        webhook: { name: webhookName },
    };
}

// ── Engine ───────────────────────────────────────────────────────────────────

const engine = createTemplateEngine({ roots: WEBHOOK_TEMPLATE_ROOTS });

/** Fills the placeholders of a string as text: for a URL or a header. */
export function renderTemplateText(text: string, context: WebhookContext): string {
    return engine.renderTemplateText(text, context);
}

/** Fills a parsed template. Throws on a template that does not compile. */
export function renderTemplate(template: unknown, context: WebhookContext): unknown {
    return engine.renderTemplate(template, context);
}

/**
 * Why a body template cannot be used, or null. Checked on save, so a broken template is
 * refused in the editor instead of failing on the first event, when nobody is looking.
 */
export function webhookTemplateError(source: string): string | null {
    return engine.templateError(source);
}

/** Why strings with placeholders -- a URL, header values -- cannot be used, or null. */
export function placeholderError(node: unknown): string | null {
    return engine.placeholderError(node);
}

// ── Filters ──────────────────────────────────────────────────────────────────

/** Whether an event passes a webhook's filters: its level at least, and one of its kinds. */
export function webhookAccepts(
    filter: { minLevel: ActivityLevel; kinds: string[] },
    record: Pick<ActivityRecord, "kind" | "level">,
): boolean {
    if (ACTIVITY_LEVELS.indexOf(record.level) < ACTIVITY_LEVELS.indexOf(filter.minLevel)) {
        return false;
    }
    return filter.kinds.length === 0 || filter.kinds.some((p) => matchesKindPattern(record.kind, p));
}

// ── Sample ───────────────────────────────────────────────────────────────────

type SampleFacts = Pick<ActivityRecord, "kind" | "level" | "source" | "subject" | "data"> &
    Partial<Pick<ActivityRecord, "correlationId">>;

/** The projects of the samples, ids and names alike, so a preview has names to show. */
export const SAMPLE_WEBHOOK_PROJECTS: WebhookProjectInfo[] = [
    { id: "11111111-1111-4111-8111-111111111111", name: "nextcloud" },
    { id: "22222222-2222-4222-8222-222222222222", name: "monitoring" },
];

const SAMPLE_CONTAINER = {
    containerName: "nextcloud-app",
    containerId: "4f2a9c1e7b3d5a6f8e0c2b4d6a8f0e1c3b5d7a9f1e3c5b7d9a1f3e5c7b9d1a3f",
    imageRef: "nextcloud:31",
    projectIds: [SAMPLE_WEBHOOK_PROJECTS[0].id],
};

/** One per shape of `data`, so a preview can show what the webhook will receive. */
const SAMPLES: SampleFacts[] = [
    {
        kind: "container.died",
        level: "warning",
        source: "agent",
        subject: SAMPLE_CONTAINER,
        data: { exitCode: 1 },
    },
    {
        kind: "container.oom",
        level: "error",
        source: "agent",
        subject: SAMPLE_CONTAINER,
        data: null,
    },
    {
        kind: "container.health",
        level: "warning",
        source: "agent",
        subject: SAMPLE_CONTAINER,
        data: { status: "unhealthy" },
    },
    {
        kind: "autoupdate.run",
        level: "error",
        source: "agent",
        correlationId: "33333333-3333-4333-8333-333333333333",
        subject: { projectId: SAMPLE_WEBHOOK_PROJECTS[1].id, projectName: "monitoring",
                   projectIds: [SAMPLE_WEBHOOK_PROJECTS[1].id] },
        data: { schedule: SAMPLE_WEBHOOK_PROJECTS[1].id, eligible: 4, pulled: 2, updated: 1, failed: 1,
                skipped: 0, skippedNoUpdate: 2, conflicts: 0 },
    },
    {
        kind: "action.failed",
        level: "warning",
        source: "server",
        correlationId: "44444444-4444-4444-8444-444444444444",
        subject: SAMPLE_CONTAINER,
        data: { action: "restart", clientName: "docker-01", error: "No answer from the agent" },
    },
    {
        kind: "client.disconnected",
        level: "trace",
        source: "server",
        subject: null,
        data: { connectionMode: "inbound", clientName: "docker-01" },
    },
];

/**
 * The event a preview and a test delivery are rendered with: the first sample one of the
 * webhook's kinds matches, else a container that exited. `container.*` gets that one too.
 */
export function sampleWebhookRecord(kinds: string[] = []): ActivityRecord {
    const now = new Date().toISOString();
    const sample =
        SAMPLES.find((s) => kinds.some((pattern) => matchesKindPattern(s.kind, pattern))) ?? SAMPLES[0];
    return {
        id: "00000000-0000-4000-8000-000000000000",
        occurredAt: now,
        receivedAt: now,
        clientId: "sample-client",
        correlationId: null,
        seen: false,
        ...sample,
    };
}

export const SAMPLE_WEBHOOK_CLIENT: WebhookClientInfo = {
    id: "sample-client",
    displayName: "docker-01",
    hostname: "docker-01.example.net",
};

/** The name of a sample project, for rendering a sample. */
export function sampleProjectName(id: string): string | null {
    return SAMPLE_WEBHOOK_PROJECTS.find((p) => p.id === id)?.name ?? null;
}

/** What a new webhook starts with: small, but using each part of the context once. */
export const DEFAULT_WEBHOOK_TEMPLATE = `{
    "text": "[{{event.level}}] {{client.name | default(\\"server\\")}}: {{event.message}}",
    "kind": "{{event.kind}}",
    "occurredAt": "{{event.occurredAt}}",
    "subject": "{{event.subject}}",
    "data": "{{event.data}}"
}`;
