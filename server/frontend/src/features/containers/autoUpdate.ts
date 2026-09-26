import { DockerContainer } from "@dim/shared";
import { AutoUpdateLabelFilter } from "../../stores/useAutoUpdateStore";
import type { ContainerAssignment } from "../projects/hooks/useProjectMembers";

/**
 * Why a container takes part in auto-update -- and `mixed`, which only a row standing for
 * several containers can be. The agents resolve the same sources for their runs; this is
 * the reading the lists show, and both use the same labels and the same project queries.
 */
export type AutoUpdateSource = "label" | "project" | "none";

export interface ProjectRef {
    id: string;
    name: string;
}

export interface AutoUpdateEnrollment {
    source: AutoUpdateSource;
    /** The project the container belongs to, whether or not that is what enrolled it. */
    projectId: string | null;
    projectName: string | null;
    /**
     * The projects whose queries all match this container, or `null`. Such a container is
     * updated through none of them -- only through its label, on the host schedule.
     */
    conflict: ProjectRef[] | null;
}

export const NOT_ENROLLED: AutoUpdateEnrollment = {
    source: "none",
    projectId: null,
    projectName: null,
    conflict: null,
};

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

/**
 * Mirrors the agent's resolution: the configured label carrying `false` opts out of
 * everything, an otherwise matching label wins over the project, and a project enrols only
 * while it is switched on. A container in conflict between projects is enrolled by its label
 * alone, and only where the host has a schedule to run it on.
 */
export function resolveAutoUpdate(
    container: DockerContainer,
    filter: AutoUpdateLabelFilter | null,
    /** The container's assignment, see `useProjectAssignment`. */
    assignment: ContainerAssignment | undefined,
    /** Whether the host has a schedule for what is outside its projects. */
    hostSchedule: boolean,
): AutoUpdateEnrollment {
    const project = assignment?.kind === "project" ? assignment.project : null;
    const conflict =
        assignment?.kind === "conflict"
            ? assignment.projects.map((p) => ({ id: p.id, name: p.name }))
            : null;
    const ref = { projectId: project?.id ?? null, projectName: project?.name ?? null, conflict };

    const optOut = filter
        ? (container.labels?.[filter.key] ?? "").trim().toLowerCase() === "false"
        : false;
    if (optOut) return { source: "none", ...ref };
    const byLabel = matchesAutoUpdateLabel(container, filter);
    if (conflict) return { source: byLabel && hostSchedule ? "label" : "none", ...ref };
    if (byLabel) return { source: "label", ...ref };
    if (project?.autoUpdate) return { source: "project", ...ref };
    return { source: "none", ...ref };
}

/**
 * What a row standing for several containers shows. Two entries are the same reading only
 * when they were enrolled the same way by the same thing, so instances of one container
 * that sit in different projects read as mixed rather than as one project.
 */
export function aggregateAutoUpdate(
    entries: AutoUpdateEnrollment[],
): AutoUpdateEnrollment | "mixed" {
    if (entries.length === 0) return NOT_ENROLLED;
    const first = entries[0];
    const conflictKey = (e: AutoUpdateEnrollment) => e.conflict?.map((p) => p.id).join(",") ?? "";
    const uniform = entries.every(
        (e) =>
            e.source === first.source &&
            (e.source !== "project" || e.projectId === first.projectId) &&
            conflictKey(e) === conflictKey(first),
    );
    return uniform ? first : "mixed";
}

/** Whether any of the entries is in conflict -- for a mixed row, which cannot say which. */
export function anyConflict(entries: AutoUpdateEnrollment[]): boolean {
    return entries.some((e) => e.conflict !== null);
}

/** Whether the cell has something to say -- anything but the dash of a container not enrolled. */
export function hasAutoUpdateSource(enrollment: AutoUpdateEnrollment | "mixed"): boolean {
    if (enrollment === "mixed" || enrollment.conflict || enrollment.source === "label") return true;
    return enrollment.source === "project" && enrollment.projectId !== null;
}
