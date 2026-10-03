import { describe, expect, it } from "vitest";
import {
    assignedProjects,
    categoryOf,
    containerNameOf,
    describeQuery,
    findQueryConflicts,
    hasWildcard,
    imagePatternHasTag,
    matchCriterion,
    matchQuery,
    matchValue,
    ProjectQuerySchema,
    resolveAssignment,
    resolveQuery,
    splitImageRef,
    type ProjectQueryCriterion,
    type ProjectQueryHost,
    type QueryHostState,
    type QueryProject,
} from "./projectQuery.js";
import type { DockerContainer } from "./types.js";

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

const criterion = (over: Partial<ProjectQueryCriterion> = {}): ProjectQueryCriterion => ({
    id: "1",
    join: "and",
    field: "container.name",
    op: "equals",
    negate: false,
    value: "web",
    ...over,
});

const host: ProjectQueryHost = { hostname: "docker-01", displayName: "Docker One" };

const project = (id: string, query: ProjectQueryCriterion[]): QueryProject => ({
    id,
    name: `project-${id}`,
    query,
    createdAt: "2026-01-01T00:00:00.000Z",
});

describe("categoryOf", () => {
    it("is the part before the dot", () => {
        expect(categoryOf("client.displayName")).toBe("client");
        expect(categoryOf("container.name")).toBe("container");
        expect(categoryOf("image.name")).toBe("image");
    });
});

describe("containerNameOf", () => {
    it("drops the leading slash Docker reports", () => {
        expect(containerNameOf(container({ names: ["/web"] }))).toBe("web");
    });

    it("falls back to the id for a container without a name", () => {
        expect(containerNameOf(container({ id: "abc", names: [] }))).toBe("abc");
    });
});

describe("splitImageRef", () => {
    it("splits repository and tag", () => {
        expect(splitImageRef("nginx:1.27")).toEqual({ repository: "nginx", tag: "1.27" });
    });

    it("gives a reference without a tag `latest`", () => {
        expect(splitImageRef("nginx")).toEqual({ repository: "nginx", tag: "latest" });
    });

    it("does not take the port of a registry for a tag", () => {
        expect(splitImageRef("localhost:5000/team/app")).toEqual({
            repository: "localhost:5000/team/app",
            tag: "latest",
        });
        expect(splitImageRef("localhost:5000/team/app:2")).toEqual({
            repository: "localhost:5000/team/app",
            tag: "2",
        });
    });

    it("drops a digest", () => {
        expect(splitImageRef("nginx:1.27@sha256:abc")).toEqual({ repository: "nginx", tag: "1.27" });
        expect(splitImageRef("nginx@sha256:abc")).toEqual({ repository: "nginx", tag: "latest" });
    });
});

describe("imagePatternHasTag", () => {
    it("looks for a colon after the last slash", () => {
        expect(imagePatternHasTag("nginx:1.27")).toBe(true);
        expect(imagePatternHasTag("nginx")).toBe(false);
        expect(imagePatternHasTag("localhost:5000/app")).toBe(false);
        expect(imagePatternHasTag("localhost:5000/app:*")).toBe(true);
    });
});

describe("hasWildcard", () => {
    it("knows * and ?", () => {
        expect(hasWildcard("web-*")).toBe(true);
        expect(hasWildcard("web-?")).toBe(true);
        expect(hasWildcard("web-1")).toBe(false);
    });
});

describe("matchValue", () => {
    it("compares without regard to case", () => {
        expect(matchValue("equals", "Web", "web")).toBe(true);
        expect(matchValue("wildcard", "WEB-*", "web-1")).toBe(true);
    });

    it("matches the whole value, not a part of it", () => {
        expect(matchValue("equals", "web", "web-1")).toBe(false);
        expect(matchValue("wildcard", "web", "web-1")).toBe(false);
        expect(matchValue("wildcard", "*eb-*", "web-1")).toBe(true);
    });

    it("lets ? stand for exactly one character", () => {
        expect(matchValue("wildcard", "web-?", "web-1")).toBe(true);
        expect(matchValue("wildcard", "web-?", "web-10")).toBe(false);
        expect(matchValue("wildcard", "web-?", "web-")).toBe(false);
    });

    it("takes every other character literally", () => {
        expect(matchValue("wildcard", "a.b*", "a.b1")).toBe(true);
        expect(matchValue("wildcard", "a.b*", "axb1")).toBe(false);
        expect(matchValue("wildcard", "app(1)+[x]", "app(1)+[x]")).toBe(true);
    });

    it("does not read a wildcard into `equals`", () => {
        expect(matchValue("equals", "web-*", "web-1")).toBe(false);
        expect(matchValue("equals", "web-*", "web-*")).toBe(true);
    });
});

describe("matchCriterion", () => {
    it("asks the container for its name", () => {
        expect(matchCriterion(criterion({ value: "web" }), host, container())).toBe(true);
        expect(matchCriterion(criterion({ value: "db" }), host, container())).toBe(false);
    });

    it("asks the host for its hostname", () => {
        const c = criterion({ field: "client.hostname", value: "docker-01" });
        expect(matchCriterion(c, host, container())).toBe(true);
    });

    it("falls back to the hostname for a host without a display name", () => {
        const c = criterion({ field: "client.displayName", value: "docker-01" });
        expect(matchCriterion(c, host, container())).toBe(false);
        expect(matchCriterion(c, { hostname: "docker-01", displayName: null }, container())).toBe(true);
        expect(matchCriterion(c, { hostname: "docker-01", displayName: "" }, container())).toBe(true);
    });

    it("compares an image pattern without a tag with the repository alone", () => {
        const c = criterion({ field: "image.name", value: "nginx" });
        expect(matchCriterion(c, host, container({ image: "nginx:1.27" }))).toBe(true);
        expect(matchCriterion(c, host, container({ image: "nginx" }))).toBe(true);
    });

    it("compares an image pattern with a tag with repository and tag", () => {
        const c = criterion({ field: "image.name", value: "nginx:1.27" });
        expect(matchCriterion(c, host, container({ image: "nginx:1.27" }))).toBe(true);
        expect(matchCriterion(c, host, container({ image: "nginx:1.28" }))).toBe(false);
    });

    it("reads an untagged image as `latest`", () => {
        const c = criterion({ field: "image.name", value: "nginx:latest" });
        expect(matchCriterion(c, host, container({ image: "nginx" }))).toBe(true);
    });

    it("prefers the image the container was configured with over the one it reports", () => {
        // After a pull the old image loses its tag and `image` becomes a bare id.
        const c = criterion({ field: "image.name", value: "nginx" });
        const updated = container({ image: "sha256:deadbeef", configImage: "nginx:1.27" });
        expect(matchCriterion(c, host, updated)).toBe(true);
    });

    it("inverts with `negate`", () => {
        expect(matchCriterion(criterion({ value: "web", negate: true }), host, container())).toBe(false);
        expect(matchCriterion(criterion({ value: "db", negate: true }), host, container())).toBe(true);
    });

    it("matches nothing on a missing attribute, so its negation matches", () => {
        const unknown: ProjectQueryHost = { hostname: null, displayName: null };
        const c = criterion({ field: "client.hostname", op: "wildcard", value: "*" });
        expect(matchCriterion(c, unknown, container())).toBe(false);
        expect(matchCriterion({ ...c, negate: true }, unknown, container())).toBe(true);
    });
});

describe("matchQuery", () => {
    const name = (value: string, join: "and" | "or" = "and") =>
        criterion({ id: value, join, value });
    const yes = (join: "and" | "or" = "and") => name("web", join);
    const no = (join: "and" | "or" = "and") => name("other", join);

    it("matches nothing for an empty query", () => {
        expect(matchQuery([], host, container())).toBe(false);
    });

    it("ignores the join of the first criterion", () => {
        expect(matchQuery([yes("or")], host, container())).toBe(true);
        expect(matchQuery([no("or")], host, container())).toBe(false);
    });

    it("joins with and / or", () => {
        expect(matchQuery([yes(), no("and")], host, container())).toBe(false);
        expect(matchQuery([yes(), no("or")], host, container())).toBe(true);
    });

    it("evaluates strictly from left to right, without precedence", () => {
        // true OR true AND false: the usual precedence gives true, left to right gives false.
        expect(matchQuery([yes(), yes("or"), no("and")], host, container())).toBe(false);
        // false AND false OR true: (false AND false) OR true.
        expect(matchQuery([no(), no("and"), yes("or")], host, container())).toBe(true);
    });
});

describe("resolveAssignment", () => {
    const web = project("a", [criterion({ value: "web" })]);
    const nginx = project("b", [criterion({ field: "image.name", value: "nginx" })]);
    const db = project("c", [criterion({ value: "db" })]);

    it("is none when no project matches", () => {
        expect(resolveAssignment([db], host, container())).toEqual({ kind: "none" });
    });

    it("names the one project that matches", () => {
        expect(resolveAssignment([web, db], host, container())).toEqual({ kind: "project", project: web });
    });

    it("is a conflict when several match", () => {
        expect(resolveAssignment([web, nginx, db], host, container())).toEqual({
            kind: "conflict",
            projects: [web, nginx],
        });
    });

    it("lists the projects of an assignment", () => {
        expect(assignedProjects({ kind: "none" })).toEqual([]);
        expect(assignedProjects({ kind: "project", project: web })).toEqual([web]);
        expect(assignedProjects({ kind: "conflict", projects: [web, nginx] })).toEqual([web, nginx]);
    });
});

describe("resolveQuery and findQueryConflicts", () => {
    const states: QueryHostState[] = [
        {
            clientId: "h1",
            host: { hostname: "docker-01", displayName: null },
            containers: [container({ id: "c1", names: ["/web"] }), container({ id: "c2", names: ["/db"] })],
        },
        {
            clientId: "h2",
            host: { hostname: "docker-02", displayName: null },
            containers: [container({ id: "c3", names: ["/web"] })],
        },
    ];

    it("finds the containers of every host", () => {
        const hits = resolveQuery([criterion({ value: "web" })], states);
        expect(hits.map((h) => `${h.clientId}/${h.container.id}`)).toEqual(["h1/c1", "h2/c3"]);
    });

    it("evaluates a client criterion against the host of each container", () => {
        const hits = resolveQuery([criterion({ field: "client.hostname", value: "docker-02" })], states);
        expect(hits.map((h) => h.container.id)).toEqual(["c3"]);
    });

    it("names every container another project already holds", () => {
        const other = project("other", [criterion({ field: "client.hostname", value: "docker-01" })]);
        expect(findQueryConflicts([criterion({ value: "web" })], [other], states)).toEqual([
            {
                clientId: "h1",
                containerId: "c1",
                containerName: "web",
                projectId: "other",
                projectName: "project-other",
            },
        ]);
    });

    it("does not count the project being edited", () => {
        const self = project("self", [criterion({ value: "web" })]);
        expect(findQueryConflicts(self.query, [self], states, "self")).toEqual([]);
        expect(findQueryConflicts(self.query, [self], states)).toHaveLength(2);
    });
});

describe("describeQuery", () => {
    const text = (c: ProjectQueryCriterion) => c.value;
    const c = (value: string, join: "and" | "or" = "and") => criterion({ id: value, join, value });

    it("is empty for an empty query", () => {
        expect(describeQuery([], text)).toBe("");
    });

    it("reads a query on a single join without brackets", () => {
        expect(describeQuery([c("a")], text)).toBe("a");
        expect(describeQuery([c("a"), c("b", "or"), c("c", "or")], text)).toBe("a OR b OR c");
    });

    it("brackets what a mixed query closes over", () => {
        expect(describeQuery([c("a"), c("b", "or"), c("c", "and")], text)).toBe("(a OR b) AND c");
        expect(describeQuery([c("a"), c("b", "and"), c("c", "or"), c("d", "and")], text)).toBe(
            "((a AND b) OR c) AND d",
        );
    });
});

describe("ProjectQuerySchema", () => {
    it("refuses an empty query and an empty value", () => {
        expect(ProjectQuerySchema.safeParse([]).success).toBe(false);
        expect(ProjectQuerySchema.safeParse([criterion({ value: "   " })]).success).toBe(false);
    });

    it("trims the value and defaults `negate`", () => {
        const parsed = ProjectQuerySchema.parse([
            { id: "1", join: "and", field: "container.name", op: "equals", value: "  web " },
        ]);
        expect(parsed[0]).toMatchObject({ value: "web", negate: false });
    });
});
