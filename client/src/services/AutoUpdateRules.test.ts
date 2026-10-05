import { describe, expect, it } from "vitest";
import type {
    AutoUpdatePolicy,
    AutoUpdatePolicyProject,
    DockerContainer,
    DockerImage,
} from "@dim/shared";
import {
    HOST_SCHEDULE,
    assignmentOf,
    hostFallbackOf,
    isOptedOut,
    matchesLabel,
    parseDelayDays,
    projectScheduleKey,
    resolveImage,
    scheduleKeyOf,
} from "./AutoUpdateRules.js";

const LABEL = "dim.auto-update";
const DELAY_LABEL = "dim.auto-update.delay";

const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "c1",
    names: ["/web"],
    image: "nginx:1.27",
    imageId: "sha256:aaa",
    command: "",
    created: 0,
    state: "running",
    ports: [],
    labels: {},
    ...over,
});

/** A project whose query is "the container is called `name`". */
const project = (id: string, name: string, over: Partial<AutoUpdatePolicyProject> = {}): AutoUpdatePolicyProject => ({
    id,
    name: `project-${id}`,
    query: [{ id: "1", join: "and", field: "container.name", op: "equals", negate: false, value: name }],
    createdAt: "2026-01-01T00:00:00.000Z",
    autoUpdate: true,
    cron: "0 3 * * *",
    ...over,
});

const policy = (over: Partial<AutoUpdatePolicy> = {}): AutoUpdatePolicy => ({
    updatedAt: "2026-01-01T00:00:00.000Z",
    host: { hostname: "docker-01", displayName: "Docker One" },
    labelKey: LABEL,
    labelValue: "true",
    delayLabelKey: DELAY_LABEL,
    hostCron: "0 4 * * *",
    projects: [],
    ...over,
});

const labelled = (value: string, over: Partial<DockerContainer> = {}) =>
    container({ labels: { [LABEL]: value }, ...over });

const image = (over: Partial<DockerImage> = {}): DockerImage =>
    ({
        id: "sha256:aaa",
        repoTags: ["nginx:1.27"],
        repoDigests: ["nginx@sha256:111"],
        ...over,
    }) as DockerImage;

describe("isOptedOut", () => {
    it("is the configured label carrying false, in any case", () => {
        expect(isOptedOut(labelled("false"), policy())).toBe(true);
        expect(isOptedOut(labelled(" False "), policy())).toBe(true);
    });

    it("is not any other value, nor a missing label", () => {
        expect(isOptedOut(labelled("true"), policy())).toBe(false);
        expect(isOptedOut(labelled("no"), policy())).toBe(false);
        expect(isOptedOut(container(), policy())).toBe(false);
    });

    it("does not exist without a configured label", () => {
        expect(isOptedOut(container({ labels: { "": "false" } }), policy({ labelKey: "" }))).toBe(false);
    });
});

describe("matchesLabel", () => {
    it("needs the configured value", () => {
        expect(matchesLabel(labelled("true"), policy())).toBe(true);
        expect(matchesLabel(labelled("yes"), policy())).toBe(false);
        expect(matchesLabel(container(), policy())).toBe(false);
    });

    it("is satisfied by the key alone when no value is configured", () => {
        expect(matchesLabel(labelled("anything"), policy({ labelValue: null }))).toBe(true);
        expect(matchesLabel(container(), policy({ labelValue: null }))).toBe(false);
    });

    it("matches nothing without a configured label", () => {
        expect(matchesLabel(labelled("true"), policy({ labelKey: "" }))).toBe(false);
    });
});

describe("parseDelayDays", () => {
    const delayed = (value: string) => container({ labels: { [DELAY_LABEL]: value } });

    it("reads the days from the delay label", () => {
        expect(parseDelayDays(delayed("7"), policy())).toBe(7);
        expect(parseDelayDays(delayed("3 days"), policy())).toBe(3);
    });

    it("is zero for a missing, negative or unreadable value", () => {
        expect(parseDelayDays(container(), policy())).toBe(0);
        expect(parseDelayDays(delayed("-2"), policy())).toBe(0);
        expect(parseDelayDays(delayed("soon"), policy())).toBe(0);
    });

    it("honours no delay without a configured delay label", () => {
        expect(parseDelayDays(delayed("7"), policy({ delayLabelKey: "" }))).toBe(0);
    });
});

describe("resolveImage", () => {
    it("names the configured tag, not the bare id a container reports after a pull", () => {
        const pulled = container({ image: "sha256:aaa", configImage: "nginx:1.27" });

        expect(resolveImage(pulled, [image()])).toEqual({
            imageRef: "nginx:1.27",
            repoDigests: ["nginx@sha256:111"],
            tagImageId: "sha256:aaa",
        });
    });

    it("falls back to the image the container reports", () => {
        expect(resolveImage(container(), [image()]).imageRef).toBe("nginx:1.27");
    });

    it("knows no digests and no tag image without a local copy of the tag", () => {
        expect(resolveImage(container(), [])).toEqual({
            imageRef: "nginx:1.27",
            repoDigests: [],
            tagImageId: null,
        });
    });

    it("takes the platform from the image the container runs, before the one the tag points to", () => {
        const arm = { os: "linux", architecture: "arm64" };
        const amd = { os: "linux", architecture: "amd64" };
        const running = image({ id: "sha256:aaa", repoTags: [], platform: arm } as Partial<DockerImage>);
        const tagged = image({ id: "sha256:bbb", platform: amd } as Partial<DockerImage>);

        const resolved = resolveImage(container({ imageId: "sha256:aaa" }), [running, tagged]);
        expect(resolved.platform).toEqual(arm);
        expect(resolved.tagImageId).toBe("sha256:bbb");
        expect(resolveImage(container({ imageId: "sha256:zzz" }), [tagged]).platform).toEqual(amd);
    });
});

describe("assignmentOf", () => {
    it("is none, one project or a conflict", () => {
        const web = project("p1", "web");
        const alsoWeb = project("p2", "web");

        expect(assignmentOf(container(), policy()).kind).toBe("none");
        expect(assignmentOf(container(), policy({ projects: [web] }))).toEqual({ kind: "project", project: web });
        expect(assignmentOf(container(), policy({ projects: [web, alsoWeb] }))).toEqual({
            kind: "conflict",
            projects: [web, alsoWeb],
        });
    });

    it("matches client criteria against the host the policy names", () => {
        const onHost = project("p1", "web", {
            query: [{ id: "1", join: "and", field: "client.hostname", op: "equals", negate: false, value: "docker-01" }],
        });

        expect(assignmentOf(container(), policy({ projects: [onHost] })).kind).toBe("project");
        expect(
            assignmentOf(
                container(),
                policy({ projects: [onHost], host: { hostname: "docker-02", displayName: null } }),
            ).kind,
        ).toBe("none");
    });
});

describe("scheduleKeyOf", () => {
    const web = project("p1", "web");
    const alsoWeb = project("p2", "web");
    const keyOf = (c: DockerContainer, p: AutoUpdatePolicy) => scheduleKeyOf(c, assignmentOf(c, p), p);

    it("puts a container without a project on the host schedule", () => {
        expect(keyOf(container(), policy())).toBe(HOST_SCHEDULE);
    });

    it("puts a container on its project's schedule, labelled or not", () => {
        const withProject = policy({ projects: [web] });

        expect(keyOf(container(), withProject)).toBe(projectScheduleKey(web));
        expect(keyOf(labelled("true"), withProject)).toBe("project:p1");
    });

    it("puts a conflicting container on the host schedule only through its label", () => {
        const conflict = policy({ projects: [web, alsoWeb] });

        expect(keyOf(labelled("true"), conflict)).toBe(HOST_SCHEDULE);
        expect(keyOf(container(), conflict)).toBeNull();
    });

    it("puts a conflicting container on no schedule when it opted out or the host has none", () => {
        const conflict = policy({ projects: [web, alsoWeb], labelValue: null });

        expect(keyOf(labelled("false"), conflict)).toBeNull();
        expect(keyOf(labelled("true"), { ...conflict, hostCron: "  " })).toBeNull();
    });
});

describe("hostFallbackOf", () => {
    it("needs the label, no opt-out and a host schedule", () => {
        expect(hostFallbackOf(labelled("true"), policy())).toBe(true);
        expect(hostFallbackOf(container(), policy())).toBe(false);
        expect(hostFallbackOf(labelled("false"), policy({ labelValue: null }))).toBe(false);
        expect(hostFallbackOf(labelled("true"), policy({ hostCron: "" }))).toBe(false);
    });
});
