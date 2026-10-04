import { describe, expect, it } from "vitest";
import { check, client, container, dockerState, image, project } from "../../../lib/fleet.testdata";
import {
    belongsTo,
    buildProjectMembers,
    containerKey,
    hostHasSchedule,
    hostStates,
    projectAssignment,
} from "./projectMembers";

const clients = [client("h1", { displayName: "docker-01" }), client("h2")];

const members = (states: Parameters<typeof hostStates>[1], projects = [project("a", "web*")]) => {
    const assignment = projectAssignment(hostStates(clients, states), projects);
    return { assignment, byProject: buildProjectMembers(states, assignment) };
};

describe("hostStates", () => {
    it("gives every host its identity and its containers", () => {
        const states = hostStates(clients, { h1: dockerState([container()]) });
        expect(states).toEqual([
            { clientId: "h1", host: { hostname: "h1", displayName: "docker-01" }, containers: [container()] },
        ]);
    });

    it("keeps a host the client list does not know, without an identity", () => {
        const [state] = hostStates([], { gone: dockerState([]) });
        expect(state.host).toEqual({ hostname: null, displayName: null });
    });
});

describe("projectAssignment", () => {
    it("leaves a container in no project out of the map", () => {
        const { assignment } = members({ h1: dockerState([container(), container({ id: "c2", names: ["/db"] })]) });
        expect([...assignment.keys()]).toEqual([containerKey("h1", "c1")]);
    });

    it("is empty without projects", () => {
        expect(members({ h1: dockerState([container()]) }, []).assignment.size).toBe(0);
    });

    it("names every project a container matches as a conflict", () => {
        const { assignment } = members({ h1: dockerState([container()]) }, [project("a", "web*"), project("b", "web")]);
        const assigned = assignment.get(containerKey("h1", "c1"));
        expect(assigned?.kind).toBe("conflict");
        expect(belongsTo(assigned, "a")).toBe(true);
        expect(belongsTo(assigned, "b")).toBe(true);
        expect(belongsTo(assigned, "c")).toBe(false);
        expect(belongsTo(undefined, "a")).toBe(false);
    });
});

describe("buildProjectMembers", () => {
    it("counts one image for two hosts on the same reference", () => {
        const { byProject } = members({
            h1: dockerState([container()], [image({ updateCheck: check(false) })]),
            h2: dockerState([container({ id: "c9" })], [image({ repoDigests: ["nginx@sha256:d2"], updateCheck: check(true) })]),
        });
        const a = byProject.get("a")!;
        expect(a.clientIds).toEqual(["h1", "h2"]);
        expect(a.containerCount).toBe(2);
        expect(a.imageCount).toBe(1);
        expect(a.targets[0]).toMatchObject({
            imageRef: "nginx:1.27",
            repoDigests: ["nginx@sha256:d1", "nginx@sha256:d2"],
            clientIds: ["h1", "h2"],
            containerIds: { h1: ["c1"], h2: ["c9"] },
            hostStatus: { h1: "current", h2: "update" },
            updateStatus: "update",
        });
        // One host behind is visible on the project's own row.
        expect(a.updateStatus).toBe("update");
    });

    it("counts one image for two containers of a host on the same reference", () => {
        const { byProject } = members({
            h1: dockerState([container(), container({ id: "c2", names: ["/web-2"] })], [image()]),
        });
        const a = byProject.get("a")!;
        expect(a.containerCount).toBe(2);
        expect(a.imageCount).toBe(1);
        expect(a.targets[0].containerIds).toEqual({ h1: ["c1", "c2"] });
    });

    it("tells an image nobody has checked from one that is current", () => {
        const { byProject } = members({ h1: dockerState([container()], [image()]) });
        expect(byProject.get("a")!.updateStatus).toBe("unchecked");
    });

    it("leaves an image whose check failed unchecked", () => {
        const { byProject } = members({
            h1: dockerState([container()], [image({ updateCheck: check(false, "rate limited") })]),
        });
        expect(byProject.get("a")!.updateStatus).toBe("unchecked");
    });

    it("lists a container in conflict under each project, and counts it as a conflict in each", () => {
        const { byProject } = members(
            { h1: dockerState([container(), container({ id: "c2", names: ["/web-2"] })], [image()]) },
            [project("a", "web*"), project("b", "web")],
        );
        expect(byProject.get("a")).toMatchObject({ containerCount: 2, conflictCount: 1 });
        expect(byProject.get("b")).toMatchObject({ containerCount: 1, conflictCount: 1 });
    });

    it("has no entry for a project without members", () => {
        const { byProject } = members({ h1: dockerState([container({ names: ["/db"] })]) });
        expect(byProject.has("a")).toBe(false);
    });
});

describe("hostHasSchedule", () => {
    it("reads an empty expression as no schedule, and null as the inherited default", () => {
        expect(hostHasSchedule(client("h1", { autoUpdateCron: "" }))).toBe(false);
        expect(hostHasSchedule(client("h1", { autoUpdateCron: null }))).toBe(true);
        expect(hostHasSchedule(client("h1", { autoUpdateCron: "0 3 * * *" }))).toBe(true);
    });
});
