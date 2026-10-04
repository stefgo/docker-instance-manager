import { describe, expect, it } from "vitest";
import { check, client, container, dockerState, image, offline, project } from "../../../lib/fleet.testdata";
import { containerGroupId, containerInstanceNodeId } from "../../../lib/paths";
import { hostStates, projectAssignment } from "../../projects/lib/projectMembers";
import { type ContainerGroupsInput, aggregateContainerState, buildContainerGroups } from "./containerGroups";

const groups = (
    input: Pick<ContainerGroupsInput, "clients" | "dockerStates"> & {
        projects?: Parameters<typeof projectAssignment>[1];
        projectId?: string;
    },
) =>
    buildContainerGroups({
        clients: input.clients,
        dockerStates: input.dockerStates,
        assignment: projectAssignment(hostStates(input.clients, input.dockerStates), input.projects ?? []),
        labelFilter: null,
        projectId: input.projectId,
    });

describe("buildContainerGroups", () => {
    it("puts the same name and image on two hosts into one group", () => {
        const [group, ...rest] = groups({
            clients: [client("h1", { displayName: "docker-01" }), client("h2")],
            dockerStates: {
                h1: dockerState([container()], [image()]),
                h2: dockerState([container({ id: "c9" })], [image({ repoDigests: ["nginx@sha256:d2"] })]),
            },
        });
        expect(rest).toEqual([]);
        expect(group).toMatchObject({
            id: containerGroupId("web", "nginx:1.27"),
            name: "web",
            configImage: "nginx:1.27",
            clientCount: 2,
            clientIds: ["h1", "h2"],
            repoDigests: ["nginx@sha256:d1", "nginx@sha256:d2"],
            aggregateState: "running",
        });
        expect(group.children?.map((c) => [c.id, c.clientName, c.containerId])).toEqual([
            [containerInstanceNodeId(group.id, "h1"), "docker-01", "c1"],
            [containerInstanceNodeId(group.id, "h2"), "h2", "c9"],
        ]);
    });

    it("keeps the same name on a different image apart", () => {
        const result = groups({
            clients: [client("h1"), client("h2")],
            dockerStates: {
                h1: dockerState([container()]),
                h2: dockerState([container({ configImage: "nginx:1.28" })]),
            },
        });
        expect(result.map((g) => g.id)).toEqual([
            containerGroupId("web", "nginx:1.27"),
            containerGroupId("web", "nginx:1.28"),
        ]);
    });

    it("reads a reference without a tag as latest, and finds its image", () => {
        const [group] = groups({
            clients: [client("h1")],
            dockerStates: {
                h1: dockerState(
                    [container({ configImage: "nginx" })],
                    [image({ repoTags: ["nginx:latest"], updateCheck: check(true) })],
                ),
            },
        });
        expect(group.configImage).toBe("nginx:latest");
        expect(group.updateStatus).toBe("update");
    });

    it("is unknown while every host is offline: the last snapshot is not the present", () => {
        const [group] = groups({
            clients: [offline("h1")],
            dockerStates: { h1: dockerState([container()]) },
        });
        expect(group.aggregateState).toBe("unknown");
        expect(group.instances).toEqual([
            { clientId: "h1", containerId: "c1", state: "running", clientOnline: false },
        ]);
    });

    it("reads the state from the connected hosts only", () => {
        const [group] = groups({
            clients: [client("h1"), offline("h2")],
            dockerStates: {
                h1: dockerState([container({ state: "exited" })]),
                h2: dockerState([container({ id: "c9" })]),
            },
        });
        expect(group.aggregateState).toBe("stopped");
    });

    it("is mixed where the connected hosts disagree", () => {
        const [group] = groups({
            clients: [client("h1"), client("h2")],
            dockerStates: {
                h1: dockerState([container()]),
                h2: dockerState([container({ id: "c9", state: "exited" })]),
            },
        });
        expect(group.aggregateState).toBe("mixed");
    });

    it("shows the update one host has on the group, and why another has no answer", () => {
        const [group] = groups({
            clients: [client("h1"), client("h2"), client("h3")],
            dockerStates: {
                h1: dockerState([container()], [image({ updateCheck: check(true) })]),
                h2: dockerState([container({ id: "c2" })], [image({ updateCheck: check(false, "rate limited") })]),
                h3: dockerState([container({ id: "c3" })]),
            },
        });
        expect(group.updateStatus).toBe("update");
        expect(group.children?.map((c) => c.updateStatus)).toEqual(["update", "unchecked", "none"]);
        expect(group.updateChecks).toEqual([
            { checkedAt: "2026-10-03T11:00:00Z" },
            { checkedAt: "2026-10-03T11:00:00Z", error: "rate limited" },
        ]);
    });

    it("marks a container two projects claim, and lists it under each of them", () => {
        const input = {
            clients: [client("h1")],
            dockerStates: { h1: dockerState([container(), container({ id: "c2", names: ["/db"] })]) },
            projects: [project("a", "web*"), project("b", "web")],
        };
        const all = groups(input);
        expect(all.map((g) => [g.name, g.hasConflict])).toEqual([
            ["web", true],
            ["db", false],
        ]);
        expect(groups({ ...input, projectId: "a" }).map((g) => g.name)).toEqual(["web"]);
        expect(groups({ ...input, projectId: "b" }).map((g) => g.name)).toEqual(["web"]);
        expect(groups({ ...input, projectId: "c" })).toEqual([]);
    });

    it("names a container without a name by its id", () => {
        const [group] = groups({
            clients: [client("h1")],
            dockerStates: { h1: dockerState([container({ names: [] })]) },
        });
        expect(group.name).toBe("c1");
    });
});

describe("aggregateContainerState", () => {
    it("reads everything that neither runs nor pauses as stopped", () => {
        expect(aggregateContainerState([])).toBe("unknown");
        expect(aggregateContainerState(["running", "running"])).toBe("running");
        expect(aggregateContainerState(["paused"])).toBe("paused");
        expect(aggregateContainerState(["created"])).toBe("stopped");
        expect(aggregateContainerState(["exited", "dead"])).toBe("mixed");
    });
});
