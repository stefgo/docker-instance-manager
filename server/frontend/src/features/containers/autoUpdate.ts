import { useMemo } from "react";
import { COMPOSE_PROJECT_LABEL, DockerContainer } from "@dim/shared";
import { AutoUpdateLabelFilter } from "../../stores/useAutoUpdateStore";
import { useProjectStore } from "../../stores/useProjectStore";

/**
 * Why a container takes part in auto-update -- and `mixed`, which only a row standing for
 * several containers can be. The server resolves the same two sources for its sweep; this
 * is the reading the lists show, and both read the very same labels.
 */
export type AutoUpdateSource = "label" | "project" | "none";

export interface AutoUpdateEnrollment {
    source: AutoUpdateSource;
    /** The Compose stack the container belongs to, whether or not that is what enrolled it. */
    projectName: string | null;
}

export const NOT_ENROLLED: AutoUpdateEnrollment = { source: "none", projectName: null };

export function matchesAutoUpdateLabel(
    container: DockerContainer,
    filter: AutoUpdateLabelFilter | null,
): boolean {
    if (!filter) return false;
    const labels = container.labels ?? {};
    if (!(filter.key in labels)) return false;
    if (filter.value === null) return true;
    return labels[filter.key] === filter.value;
}

export function projectNameOf(container: DockerContainer): string | null {
    const name = container.labels?.[COMPOSE_PROJECT_LABEL];
    return name && name.length > 0 ? name : null;
}

/** The names of the projects that currently have auto-update switched on. */
export function useAutoUpdateProjects(): Set<string> {
    const projects = useProjectStore((s) => s.projects);
    return useMemo(
        () => new Set(projects.filter((p) => p.autoUpdate).map((p) => p.name)),
        [projects],
    );
}

/**
 * Mirrors the server's resolution: the configured label carrying `false` opts out of
 * everything, an otherwise matching label wins over the project, and a project enrols only
 * while it is switched on.
 */
export function resolveAutoUpdate(
    container: DockerContainer,
    filter: AutoUpdateLabelFilter | null,
    autoUpdateProjects: Set<string>,
): AutoUpdateEnrollment {
    const projectName = projectNameOf(container);
    const optOut = filter
        ? (container.labels?.[filter.key] ?? "").trim().toLowerCase() === "false"
        : false;
    if (optOut) return { source: "none", projectName };
    if (matchesAutoUpdateLabel(container, filter)) return { source: "label", projectName };
    if (projectName !== null && autoUpdateProjects.has(projectName)) {
        return { source: "project", projectName };
    }
    return { source: "none", projectName };
}

/**
 * What a row standing for several containers shows. Two entries are the same reading only
 * when they were enrolled the same way by the same thing, so instances of one container
 * that sit in differently named stacks read as mixed rather than as one project.
 */
export function aggregateAutoUpdate(
    entries: AutoUpdateEnrollment[],
): AutoUpdateEnrollment | "mixed" {
    if (entries.length === 0) return NOT_ENROLLED;
    const first = entries[0];
    const uniform = entries.every(
        (e) =>
            e.source === first.source &&
            (e.source !== "project" || e.projectName === first.projectName),
    );
    return uniform ? first : "mixed";
}
