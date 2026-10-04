import { describe, expect, it } from "vitest";
import { check, client, container, dockerState, image, offline } from "../../../lib/fleet.testdata";
import { notRunning, updatesAvailable } from "../../dashboard/lib/dashboard";
import { type ContainerNode, buildContainerGroups } from "./containerGroups";
import { filterContainers, parseStateFilter, parseUpdateFilter } from "./filterContainers";

// `web` on three hosts, one of them offline; `db` and the never-checked `cache` on the first.
const groups = buildContainerGroups({
    clients: [client("h1", { displayName: "alpha" }), client("h2"), offline("h3")],
    dockerStates: {
        h1: dockerState(
            [
                container(),
                container({ id: "c2", names: ["/db"], state: "exited" }),
                container({ id: "c5", names: ["/cache"], image: "redis:7", configImage: "redis:7", imageId: "sha256:bbb" }),
            ],
            [image({ updateCheck: check(true) }), image({ id: "sha256:bbb", repoTags: ["redis:7"] })],
        ),
        h2: dockerState([container({ id: "c3" })], [image({ updateCheck: check(false) })]),
        h3: dockerState([container({ id: "c4", state: "exited" })], [image({ updateCheck: check(true) })]),
    },
    assignment: new Map(),
    labelFilter: null,
});

/** The host rows a result shows, as `name@host`. */
const rows = (result: ContainerNode[]) =>
    result.flatMap((group) => (group.children ?? []).map((child) => `${group.name}@${child.clientId}`)).sort();

describe("filterContainers", () => {
    it("returns every group while nothing is asked for", () => {
        expect(filterContainers(groups, {})).toEqual(groups);
        expect(filterContainers(groups, { query: "  ", state: "all", update: "all" })).toEqual(groups);
    });

    it("keeps the instances that run on a connected host", () => {
        expect(rows(filterContainers(groups, { state: "running" }))).toEqual(["cache@h1", "web@h1", "web@h2"]);
    });

    it("does not read a stopped container of an offline host as not running", () => {
        expect(rows(filterContainers(groups, { state: "not-running" }))).toEqual(["db@h1"]);
        expect(rows(filterContainers(groups, { state: "unknown" }))).toEqual(["web@h3"]);
    });

    it("keeps the instances with the update status asked for", () => {
        expect(rows(filterContainers(groups, { update: "update" }))).toEqual(["db@h1", "web@h1", "web@h3"]);
        expect(rows(filterContainers(groups, { update: "current" }))).toEqual(["web@h2"]);
        expect(rows(filterContainers(groups, { update: "unchecked" }))).toEqual(["cache@h1"]);
    });

    it("applies both filters at once", () => {
        expect(rows(filterContainers(groups, { state: "running", update: "update" }))).toEqual(["web@h1"]);
        expect(filterContainers(groups, { state: "unknown", update: "current" })).toEqual([]);
    });

    it("leaves a group that keeps only some hosts what it is as a whole", () => {
        const [web] = filterContainers(groups, { update: "current" });
        expect(web.children).toHaveLength(1);
        expect(web.clientCount).toBe(3);
        expect(web.updateStatus).toBe("update");
    });

    it("hands back the group itself where every host stays", () => {
        const db = groups.find((group) => group.name === "db");
        expect(filterContainers(groups, { state: "not-running" })[0]).toBe(db);
    });

    it("finds a group by its name or image, with every host", () => {
        expect(rows(filterContainers(groups, { query: "WEB" }))).toEqual(["web@h1", "web@h2", "web@h3"]);
        expect(rows(filterContainers(groups, { query: "redis" }))).toEqual(["cache@h1"]);
    });

    it("finds the containers of a host by the host's name", () => {
        expect(rows(filterContainers(groups, { query: "alpha" }))).toEqual(["cache@h1", "db@h1", "web@h1"]);
        expect(rows(filterContainers(groups, { query: "h3" }))).toEqual(["web@h3"]);
    });

    it("narrows a search by the filters", () => {
        expect(rows(filterContainers(groups, { query: "alpha", update: "update" }))).toEqual(["db@h1", "web@h1"]);
    });
});

describe("the cards of the overview", () => {
    it("count the rows their filter leaves", () => {
        expect(rows(filterContainers(groups, { update: "update" }))).toHaveLength(updatesAvailable(groups));
        expect(rows(filterContainers(groups, { state: "not-running" }))).toHaveLength(notRunning(groups));
    });
});

describe("a filter from the address bar", () => {
    it("is taken as it is where it is known", () => {
        expect(parseStateFilter("not-running")).toBe("not-running");
        expect(parseUpdateFilter("unchecked")).toBe("unchecked");
    });

    it("reads as no filter where it is not", () => {
        expect(parseStateFilter("")).toBe("all");
        expect(parseStateFilter(null)).toBe("all");
        expect(parseUpdateFilter("update-available")).toBe("all");
    });
});
