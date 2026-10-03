import { describe, expect, it } from "vitest";
import type { DockerContainer, ProjectSummary } from "@dim/shared";
import type { ContainerAssignment } from "../projects/hooks/useProjectMembers";
import {
    NOT_ENROLLED,
    aggregateAutoUpdate,
    anyConflict,
    hasAutoUpdateSource,
    matchesAutoUpdateLabel,
    resolveAutoUpdate,
    type AutoUpdateEnrollment,
} from "./autoUpdate";

const container = (labels: Record<string, string> = {}): DockerContainer => ({
    id: "c1",
    names: ["/web"],
    image: "nginx:1.27",
    imageId: "sha256:aaa",
    command: "",
    created: 0,
    state: "running",
    ports: [],
    labels,
});

const project = (id: string, autoUpdate: boolean): ProjectSummary =>
    ({ id, name: `project-${id}`, autoUpdate }) as ProjectSummary;

const inProject = (id: string, autoUpdate: boolean): ContainerAssignment => ({
    kind: "project",
    project: project(id, autoUpdate),
});

const inConflict: ContainerAssignment = { kind: "conflict", projects: [project("a", true), project("b", true)] };

const LABEL = { key: "dim.autoupdate", value: null };

describe("matchesAutoUpdateLabel", () => {
    it("matches nothing without a configured label", () => {
        expect(matchesAutoUpdateLabel(container({ "dim.autoupdate": "true" }), null)).toBe(false);
    });

    it("takes the presence of the key when no value is configured", () => {
        expect(matchesAutoUpdateLabel(container({ "dim.autoupdate": "" }), LABEL)).toBe(true);
        expect(matchesAutoUpdateLabel(container({ other: "x" }), LABEL)).toBe(false);
    });

    it("needs the exact value when one is configured", () => {
        const filter = { key: "dim.autoupdate", value: "true" };
        expect(matchesAutoUpdateLabel(container({ "dim.autoupdate": "true" }), filter)).toBe(true);
        expect(matchesAutoUpdateLabel(container({ "dim.autoupdate": "yes" }), filter)).toBe(false);
    });
});

describe("resolveAutoUpdate", () => {
    it("does not enrol a container nothing claims", () => {
        expect(resolveAutoUpdate(container(), LABEL, undefined, true)).toEqual(NOT_ENROLLED);
        expect(resolveAutoUpdate(container(), LABEL, { kind: "none" }, true)).toEqual(NOT_ENROLLED);
    });

    it("enrols by label", () => {
        expect(resolveAutoUpdate(container({ "dim.autoupdate": "true" }), LABEL, undefined, true).source).toBe(
            "label",
        );
    });

    it("enrols through a project only while the project is switched on", () => {
        expect(resolveAutoUpdate(container(), LABEL, inProject("a", true), true)).toEqual({
            source: "project",
            projectId: "a",
            projectName: "project-a",
            conflict: null,
        });
        // The project is still named: the container belongs to it, it just does not enrol it.
        expect(resolveAutoUpdate(container(), LABEL, inProject("a", false), true)).toEqual({
            source: "none",
            projectId: "a",
            projectName: "project-a",
            conflict: null,
        });
    });

    it("lets a matching label win over the project", () => {
        const labelled = container({ "dim.autoupdate": "true" });
        expect(resolveAutoUpdate(labelled, LABEL, inProject("a", true), true)).toMatchObject({
            source: "label",
            projectId: "a",
        });
    });

    it("lets the label carrying `false` opt out of everything", () => {
        for (const value of ["false", "FALSE", " false "]) {
            const optedOut = container({ "dim.autoupdate": value });
            expect(resolveAutoUpdate(optedOut, LABEL, inProject("a", true), true).source).toBe("none");
            expect(resolveAutoUpdate(optedOut, LABEL, undefined, true).source).toBe("none");
        }
    });

    it("knows no opt-out without a configured label", () => {
        const labelled = container({ "dim.autoupdate": "false" });
        expect(resolveAutoUpdate(labelled, null, inProject("a", true), true).source).toBe("project");
    });

    it("updates a container in conflict through none of its projects", () => {
        expect(resolveAutoUpdate(container(), LABEL, inConflict, true)).toEqual({
            source: "none",
            projectId: null,
            projectName: null,
            conflict: [
                { id: "a", name: "project-a" },
                { id: "b", name: "project-b" },
            ],
        });
    });

    it("enrols a container in conflict by its label, and only where the host has a schedule", () => {
        const labelled = container({ "dim.autoupdate": "true" });
        expect(resolveAutoUpdate(labelled, LABEL, inConflict, true).source).toBe("label");
        expect(resolveAutoUpdate(labelled, LABEL, inConflict, false).source).toBe("none");
    });

    it("does not ask for a host schedule outside a conflict", () => {
        const labelled = container({ "dim.autoupdate": "true" });
        expect(resolveAutoUpdate(labelled, LABEL, undefined, false).source).toBe("label");
    });
});

describe("aggregateAutoUpdate", () => {
    const byLabel: AutoUpdateEnrollment = { ...NOT_ENROLLED, source: "label" };
    const byProject = (id: string): AutoUpdateEnrollment => ({
        source: "project",
        projectId: id,
        projectName: `project-${id}`,
        conflict: null,
    });
    const conflicting = (...ids: string[]): AutoUpdateEnrollment => ({
        ...NOT_ENROLLED,
        conflict: ids.map((id) => ({ id, name: `project-${id}` })),
    });

    it("is not enrolled for no entries", () => {
        expect(aggregateAutoUpdate([])).toBe(NOT_ENROLLED);
    });

    it("is the common reading where every entry agrees", () => {
        expect(aggregateAutoUpdate([byLabel, byLabel])).toBe(byLabel);
        expect(aggregateAutoUpdate([byProject("a"), byProject("a")])).toMatchObject({ projectId: "a" });
    });

    it("is mixed where the sources differ", () => {
        expect(aggregateAutoUpdate([byLabel, NOT_ENROLLED])).toBe("mixed");
        expect(aggregateAutoUpdate([byLabel, byProject("a")])).toBe("mixed");
    });

    it("is mixed where instances of one container sit in different projects", () => {
        expect(aggregateAutoUpdate([byProject("a"), byProject("b")])).toBe("mixed");
    });

    it("does not compare the project of entries a label enrolled", () => {
        const first = { ...byLabel, projectId: "a", projectName: "project-a" };
        expect(aggregateAutoUpdate([first, { ...byLabel, projectId: "b", projectName: "project-b" }])).toBe(first);
    });

    it("is mixed where the conflicts differ", () => {
        expect(aggregateAutoUpdate([conflicting("a", "b"), conflicting("a", "b")])).not.toBe("mixed");
        expect(aggregateAutoUpdate([conflicting("a", "b"), conflicting("a", "c")])).toBe("mixed");
        expect(aggregateAutoUpdate([conflicting("a", "b"), NOT_ENROLLED])).toBe("mixed");
    });

    it("says whether any entry is in conflict, which a mixed row cannot", () => {
        expect(anyConflict([byLabel, conflicting("a", "b")])).toBe(true);
        expect(anyConflict([byLabel, byProject("a")])).toBe(false);
    });
});

describe("hasAutoUpdateSource", () => {
    it("has something to say for a label, a project, a conflict and a mixed row", () => {
        expect(hasAutoUpdateSource("mixed")).toBe(true);
        expect(hasAutoUpdateSource({ ...NOT_ENROLLED, source: "label" })).toBe(true);
        expect(hasAutoUpdateSource({ ...NOT_ENROLLED, source: "project", projectId: "a" })).toBe(true);
        expect(hasAutoUpdateSource({ ...NOT_ENROLLED, conflict: [{ id: "a", name: "a" }] })).toBe(true);
    });

    it("shows the dash for a container not enrolled, even inside a project", () => {
        expect(hasAutoUpdateSource(NOT_ENROLLED)).toBe(false);
        expect(hasAutoUpdateSource({ ...NOT_ENROLLED, projectId: "a", projectName: "a" })).toBe(false);
    });
});
