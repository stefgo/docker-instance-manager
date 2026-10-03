import { describe, expect, it } from "vitest";
import type { DockerContainer, ProjectQueryCriterion, QueryHostState } from "@dim/shared";
import {
    FIELDS_BY_CATEGORY,
    FIELD_PLACEHOLDERS,
    OPERATOR_CHOICES,
    applyOperatorChoice,
    collectSuggestions,
    completeCriteria,
    describe as describeProjectQuery,
    describeCriterion,
    fieldLabel,
    newCriterion,
    newCriterionId,
    operatorChoiceOf,
} from "./query";

const criterion = (over: Partial<ProjectQueryCriterion> = {}): ProjectQueryCriterion => ({
    id: "1",
    join: "and",
    field: "container.name",
    op: "equals",
    negate: false,
    value: "web",
    ...over,
});

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

describe("field tables", () => {
    it("offer every field once, under its own category", () => {
        const fields = Object.entries(FIELDS_BY_CATEGORY).flatMap(([category, entries]) =>
            entries.map((entry) => {
                expect(entry.field.startsWith(`${category}.`)).toBe(true);
                return entry.field;
            }),
        );
        expect([...fields].sort()).toEqual(Object.keys(FIELD_PLACEHOLDERS).sort());
    });

    it("label a field as the editor names it", () => {
        expect(fieldLabel("client.hostname")).toBe("Hostname");
        expect(fieldLabel("image.name")).toBe("Image name[:tag]");
    });
});

describe("operator choice", () => {
    it("reads operator and negation as one choice", () => {
        expect(operatorChoiceOf(criterion({ op: "equals", negate: false }))).toBe("is");
        expect(operatorChoiceOf(criterion({ op: "equals", negate: true }))).toBe("isNot");
        expect(operatorChoiceOf(criterion({ op: "wildcard", negate: false }))).toBe("matches");
        expect(operatorChoiceOf(criterion({ op: "wildcard", negate: true }))).toBe("notMatches");
    });

    it("writes a choice back as operator and negation, leaving the rest alone", () => {
        for (const { value } of OPERATOR_CHOICES) {
            const applied = applyOperatorChoice(criterion(), value);
            expect(operatorChoiceOf(applied)).toBe(value);
            expect(applied).toMatchObject({ id: "1", field: "container.name", value: "web" });
        }
    });
});

describe("newCriterion", () => {
    it("starts as an empty `container name is`", () => {
        expect(newCriterion()).toMatchObject({
            join: "and",
            field: "container.name",
            op: "equals",
            negate: false,
            value: "",
        });
    });

    it("takes what the caller already knows", () => {
        expect(newCriterion({ join: "or", value: "web" })).toMatchObject({ join: "or", value: "web" });
    });

    it("gives every row an id of its own", () => {
        const ids = new Set(Array.from({ length: 50 }, newCriterionId));
        expect(ids.size).toBe(50);
    });
});

describe("completeCriteria", () => {
    it("drops a criterion that is still being typed and trims the rest", () => {
        const query = [criterion({ id: "1", value: "  web " }), criterion({ id: "2", value: "   " })];
        expect(completeCriteria(query)).toEqual([criterion({ id: "1", value: "web" })]);
    });
});

describe("describeCriterion and describe", () => {
    it("reads a criterion as a sentence that names its category", () => {
        expect(describeCriterion(criterion({ field: "image.name", op: "wildcard", value: "redis:7*" }))).toBe(
            'Image name matches pattern "redis:7*"',
        );
        expect(describeCriterion(criterion({ field: "client.hostname", negate: true, value: "docker-01" }))).toBe(
            'Client hostname is not "docker-01"',
        );
    });

    it("shows an ellipsis for a value not yet typed", () => {
        expect(describeCriterion(criterion({ value: "" }))).toBe('Container name is "…"');
    });

    it("joins the sentences the way the query is evaluated", () => {
        const query = [
            criterion({ id: "1", value: "a" }),
            criterion({ id: "2", join: "or", value: "b" }),
            criterion({ id: "3", join: "and", value: "c" }),
        ];
        expect(describeProjectQuery(query)).toBe(
            '(Container name is "a" OR Container name is "b") AND Container name is "c"',
        );
    });
});

describe("collectSuggestions", () => {
    const states: QueryHostState[] = [
        {
            clientId: "h1",
            host: { hostname: "docker-02", displayName: "Prod" },
            containers: [
                container({ names: ["/web"], image: "nginx:1.27" }),
                container({ names: ["/cache"], image: "redis" }),
            ],
        },
        {
            clientId: "h2",
            host: { hostname: "docker-01", displayName: null },
            containers: [container({ names: ["/web"], image: "sha256:deadbeef", configImage: "nginx:1.27" })],
        },
    ];

    it("lists the hosts, falling back to the hostname for a display name", () => {
        const suggestions = collectSuggestions(states);
        expect(suggestions["client.hostname"]).toEqual(["docker-01", "docker-02"]);
        expect(suggestions["client.displayName"]).toEqual(["docker-01", "Prod"]);
    });

    it("lists each container name once, sorted", () => {
        expect(collectSuggestions(states)["container.name"]).toEqual(["cache", "web"]);
    });

    it("offers an image with and without its tag", () => {
        expect(collectSuggestions(states)["image.name"]).toEqual(["nginx", "nginx:1.27", "redis", "redis:latest"]);
    });

    it("does not offer a bare image id", () => {
        // After a pull the old image loses its tag; `configImage` still names it.
        const orphan: QueryHostState[] = [
            { clientId: "h1", host: { hostname: null, displayName: null }, containers: [container({ image: "sha256:abc" })] },
        ];
        expect(collectSuggestions(orphan)).toMatchObject({
            "image.name": [],
            "client.hostname": [],
            "client.displayName": [],
        });
    });
});
