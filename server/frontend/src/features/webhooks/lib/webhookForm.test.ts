import { describe, expect, it } from "vitest";
import { DEFAULT_WEBHOOK_TEMPLATE, type Webhook } from "@dim/shared";
import {
    EMPTY_DRAFT,
    PLACEHOLDERS,
    draftFrom,
    inputFrom,
    parseKinds,
    previewBody,
    type WebhookDraft,
} from "./webhookForm";

const draft = (changes: Partial<WebhookDraft> = {}): WebhookDraft => ({
    ...EMPTY_DRAFT,
    name: "Chat",
    url: "https://chat.example.org/hook",
    ...changes,
});

describe("parseKinds", () => {
    it("splits at commas and trims", () => {
        expect(parseKinds("container.died,  client.* ")).toEqual(["container.died", "client.*"]);
    });

    it("drops empty entries", () => {
        expect(parseKinds("")).toEqual([]);
        expect(parseKinds(" , container.*,, ")).toEqual(["container.*"]);
    });
});

describe("inputFrom", () => {
    it("passes the plain fields through", () => {
        expect(inputFrom(draft({ enabled: false, method: "PUT", minLevel: "error" }))).toMatchObject({
            name: "Chat",
            enabled: false,
            url: "https://chat.example.org/hook",
            method: "PUT",
            bodyTemplate: DEFAULT_WEBHOOK_TEMPLATE,
            minLevel: "error",
        });
    });

    it("reads one header per line", () => {
        expect(inputFrom(draft({ headers: "X-Token: abc\nContent-Type:application/json" })).headers).toEqual({
            "X-Token": "abc",
            "Content-Type": "application/json",
        });
    });

    it("splits a header at the first colon only", () => {
        expect(inputFrom(draft({ headers: "Authorization: Bearer a:b:c" })).headers).toEqual({
            Authorization: "Bearer a:b:c",
        });
    });

    it("skips blank lines and trims name and value", () => {
        expect(inputFrom(draft({ headers: "\n  X-A :  1  \n   \nX-B: 2\n" })).headers).toEqual({
            "X-A": "1",
            "X-B": "2",
        });
        expect(inputFrom(draft({ headers: "" })).headers).toEqual({});
    });

    it("keeps a header with an empty value", () => {
        expect(inputFrom(draft({ headers: "X-Empty:" })).headers).toEqual({ "X-Empty": "" });
    });

    it("throws on a line without a colon, naming the line", () => {
        expect(() => inputFrom(draft({ headers: "X-A: 1\n\nnonsense" }))).toThrow(
            "Header line 3 is not \"Name: value\"",
        );
    });

    it("throws on a line without a name", () => {
        expect(() => inputFrom(draft({ headers: ": value" }))).toThrow("Header line 1 is not \"Name: value\"");
    });

    // "  : value" passes today and is sent with an empty header name, which the server refuses.
    it.todo("throws on a line whose name is only spaces");

    it("turns the kinds into a list", () => {
        expect(inputFrom(draft({ kinds: "container.*, client.disconnected" })).kinds).toEqual([
            "container.*",
            "client.disconnected",
        ]);
        expect(inputFrom(draft({ kinds: "" })).kinds).toEqual([]);
    });

    it("turns the timeout into milliseconds", () => {
        expect(inputFrom(draft({ timeoutSeconds: "10" })).timeoutMs).toBe(10000);
        expect(inputFrom(draft({ timeoutSeconds: "2.5" })).timeoutMs).toBe(2500);
        expect(inputFrom(draft({ timeoutSeconds: "0.0015" })).timeoutMs).toBe(2);
    });

    it("falls back to ten seconds for a timeout that is no number", () => {
        expect(inputFrom(draft({ timeoutSeconds: "" })).timeoutMs).toBe(10000);
        expect(inputFrom(draft({ timeoutSeconds: "soon" })).timeoutMs).toBe(10000);
        expect(inputFrom(draft({ timeoutSeconds: "0" })).timeoutMs).toBe(10000);
    });
});

describe("draftFrom", () => {
    const webhook: Webhook = {
        id: "w1",
        lastStatus: 200,
        lastError: null,
        lastAttemptAt: "2026-09-28T02:15:00.000Z",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: null,
        name: "Chat",
        enabled: true,
        url: "https://chat.example.org/hook",
        method: "PUT",
        headers: { "X-Token": "a:b", "X-Other": "2" },
        bodyTemplate: "{\"text\": \"{{event.message}}\"}",
        minLevel: "error",
        kinds: ["container.*", "client.disconnected"],
        timeoutMs: 2500,
    };

    it("writes headers, kinds and the timeout as the text the editor shows", () => {
        expect(draftFrom(webhook)).toEqual({
            name: "Chat",
            enabled: true,
            url: "https://chat.example.org/hook",
            method: "PUT",
            headers: "X-Token: a:b\nX-Other: 2",
            bodyTemplate: "{\"text\": \"{{event.message}}\"}",
            minLevel: "error",
            kinds: "container.*, client.disconnected",
            timeoutSeconds: "2.5",
        });
    });

    it("survives the trip through the editor unchanged", () => {
        expect(inputFrom(draftFrom(webhook))).toEqual({
            name: webhook.name,
            enabled: webhook.enabled,
            url: webhook.url,
            method: webhook.method,
            headers: webhook.headers,
            bodyTemplate: webhook.bodyTemplate,
            minLevel: webhook.minLevel,
            kinds: webhook.kinds,
            timeoutMs: webhook.timeoutMs,
        });
    });
});

describe("EMPTY_DRAFT", () => {
    it("is a draft the API takes once name and URL are filled in", () => {
        expect(inputFrom(draft())).toMatchObject({ headers: {}, kinds: [], timeoutMs: 10000, minLevel: "warning" });
    });
});

describe("previewBody", () => {
    it("renders the sample event as formatted JSON", () => {
        const preview = previewBody("{\"text\": \"{{event.message}}\", \"hook\": \"{{webhook.name}}\"}", "Chat", "");
        expect(preview.error).toBeUndefined();
        expect(preview.kind).toBe("container.died");
        expect(JSON.parse(preview.body!)).toEqual({ text: "Container nextcloud-app exited with code 1", hook: "Chat" });
        expect(preview.body).toContain("\n  \"text\"");
    });

    it("uses the sample for the webhook's kinds", () => {
        const preview = previewBody("\"{{event.kind}}\"", "Chat", " client.* ");
        expect(preview).toEqual({ kind: "client.disconnected", body: "\"client.disconnected\"" });
    });

    it("says why a template has no preview", () => {
        expect(previewBody("{\"text\": ", "Chat", "").error).toMatch(/^Not valid JSON: /);
        expect(previewBody("\"{{container.name}}\"", "Chat", "container.oom")).toEqual({
            kind: "container.oom",
            error: expect.stringContaining("a path starts with event, client, webhook"),
        });
    });

    it("renders the default template", () => {
        const preview = previewBody(DEFAULT_WEBHOOK_TEMPLATE, "Chat", "");
        expect(preview.error).toBeUndefined();
        expect(preview.body).toContain("nextcloud-app");
    });
});

describe("PLACEHOLDERS", () => {
    it("lists only paths a template can use", () => {
        for (const { path } of PLACEHOLDERS) {
            expect(previewBody(`"{{${path}}}"`, "Chat", "").error, path).toBeUndefined();
        }
    });
});
