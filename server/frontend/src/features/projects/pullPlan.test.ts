import { describe, expect, it } from "vitest";
import { EMPTY_MEMBERS, type ProjectImageTarget, type ProjectMembers } from "./hooks/useProjectMembers";
import { canPull, planPull } from "./pullPlan";

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
