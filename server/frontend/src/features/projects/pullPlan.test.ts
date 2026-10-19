import { describe, expect, it } from "vitest";
import { EMPTY_MEMBERS, type ProjectImageTarget, type ProjectMembers } from "./lib/projectMembers";
import { canPull, isPulling, planPull, projectPullRequest } from "./pullPlan";

const target = (over: Partial<ProjectImageTarget> = {}): ProjectImageTarget => ({
    imageRef: "nginx:1.27",
    repoDigests: ["nginx@sha256:abc"],
    clientIds: ["h1", "h2"],
    containerIds: { h1: ["c1", "c2"], h2: ["c3"] },
    hostStatus: { h1: "update", h2: "current" },
    updateStatus: "update",
    ...over,
});

const members = (...targets: ProjectImageTarget[]): ProjectMembers => ({ ...EMPTY_MEMBERS, targets });

describe("planPull", () => {
    it("sends `updates` only to the hosts whose own copy is behind", () => {
        expect(planPull(members(target()), "updates")).toEqual({
            targets: [{ imageRef: "nginx:1.27", clientIds: ["h1"], containerIds: { h1: ["c1", "c2"] } }],
            containerCount: 2,
        });
    });

    it("sends `force` to every host of the reference, behind or not", () => {
        expect(planPull(members(target()), "force")).toEqual({
            targets: [
                { imageRef: "nginx:1.27", clientIds: ["h1", "h2"], containerIds: { h1: ["c1", "c2"], h2: ["c3"] } },
            ],
            containerCount: 3,
        });
    });

    it("leaves out a reference no host is behind on", () => {
        const current = target({ hostStatus: { h1: "current", h2: "unchecked" }, updateStatus: "unchecked" });
        expect(planPull(members(current), "updates")).toEqual({ targets: [], containerCount: 0 });
        expect(planPull(members(current), "force").containerCount).toBe(3);
    });

    it("never pulls a reference without a tag, forced or not", () => {
        const untagged = target({ updateStatus: "none", hostStatus: { h1: "none", h2: "none" } });
        expect(planPull(members(untagged), "force")).toEqual({ targets: [], containerCount: 0 });
        expect(planPull(members(untagged), "updates")).toEqual({ targets: [], containerCount: 0 });
    });

    it("names only the project's own containers, so others on the image are left alone", () => {
        // A host without an entry gets an empty list, never `undefined`: absent would mean
        // "every container on the old image".
        const plan = planPull(members(target({ containerIds: { h1: ["c1"] } })), "force");
        expect(plan.targets[0].containerIds).toEqual({ h1: ["c1"], h2: [] });
        expect(plan.containerCount).toBe(1);
    });

    it("plans every reference of the project", () => {
        const redis = target({
            imageRef: "redis:7",
            clientIds: ["h2"],
            containerIds: { h2: ["c9"] },
            hostStatus: { h2: "update" },
        });
        const plan = planPull(members(target(), redis), "updates");
        expect(plan.targets.map((t) => t.imageRef)).toEqual(["nginx:1.27", "redis:7"]);
        expect(plan.containerCount).toBe(3);
    });
});

describe("planPull with containerKeys", () => {
    it("keeps only the containers asked for, and the hosts that have one of them", () => {
        expect(planPull(members(target()), "force", new Set(["h2/c3"]))).toEqual({
            targets: [{ imageRef: "nginx:1.27", clientIds: ["h2"], containerIds: { h2: ["c3"] } }],
            containerCount: 1,
        });
    });

    it("still sends `updates` only to the hosts that are behind", () => {
        expect(planPull(members(target()), "updates", new Set(["h1/c2", "h2/c3"]))).toEqual({
            targets: [{ imageRef: "nginx:1.27", clientIds: ["h1"], containerIds: { h1: ["c2"] } }],
            containerCount: 1,
        });
    });

    it("leaves out a reference none of whose containers is asked for", () => {
        expect(planPull(members(target()), "force", new Set(["h9/c9"]))).toEqual({ targets: [], containerCount: 0 });
        expect(canPull(members(target()), new Set(["h9/c9"]))).toBe(false);
    });
});

describe("projectPullRequest", () => {
    it("offers the forced pull beside the one of what is behind, named after the project", () => {
        const request = projectPullRequest("web", members(target()), { scope: "shown", containerKeys: new Set(["h1/c1", "h2/c3"]) });
        expect(request).toEqual({
            targets: [{ imageRef: "nginx:1.27", clientIds: ["h1"], containerIds: { h1: ["c1"] } }],
            forced: [{ imageRef: "nginx:1.27", clientIds: ["h1", "h2"], containerIds: { h1: ["c1"], h2: ["c3"] } }],
            scope: "shown",
            selected: undefined,
            subject: "web",
        });
    });

    it("reaches the whole project from its own row", () => {
        const request = projectPullRequest("web", members(target()));
        expect(request.scope).toBeUndefined();
        expect(request.forced?.[0].containerIds).toEqual({ h1: ["c1", "c2"], h2: ["c3"] });
    });
});

describe("isPulling", () => {
    it("is true while a pull of one of the project's references runs on one of its hosts", () => {
        expect(isPulling(members(target()), { "h2::nginx:1.27": true })).toBe(true);
        expect(isPulling(members(target()), { "h2::redis:7": true, "h1::nginx:1.27": false })).toBe(false);
    });
});

describe("canPull", () => {
    it("is true as soon as a forced pull would recreate a container", () => {
        expect(canPull(members(target({ hostStatus: { h1: "current", h2: "current" }, updateStatus: "current" })))).toBe(
            true,
        );
    });

    it("is false for a project without members, or with untagged images only", () => {
        expect(canPull(EMPTY_MEMBERS)).toBe(false);
        expect(canPull(members(target({ updateStatus: "none" })))).toBe(false);
    });
});
