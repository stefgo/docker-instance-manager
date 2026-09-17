import { useEffect, useMemo } from "react";
import {
    DockerContainer,
    DockerImage,
    Client,
    ProjectAssignment,
    ProjectSummary,
    QueryHostState,
    assignedProjects,
    resolveAssignment,
} from "@dim/shared";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useProjectStore } from "../../../stores/useProjectStore";

/** What one host contributes to a project. */
export interface ProjectClientMembers {
    clientId: string;
    containers: DockerContainer[];
    /** The images behind those containers, resolved through their `configImage`. */
    images: DockerImage[];
}

export interface ProjectMembers {
    perClient: ProjectClientMembers[];
    clientIds: string[];
    containerCount: number;
    /** Distinct `configImage` values across every host, which is what a project is updated by. */
    imageCount: number;
    /** Members that match another project too, and are updated through neither. */
    conflictCount: number;
}

export const EMPTY_MEMBERS: ProjectMembers = {
    perClient: [],
    clientIds: [],
    containerCount: 0,
    imageCount: 0,
    conflictCount: 0,
};

export type ContainerAssignment = ProjectAssignment<ProjectSummary>;

/** Whether an assignment puts the container into the project -- alone or in a conflict. */
export function belongsTo(assignment: ContainerAssignment | undefined, projectId: string): boolean {
    return assignment ? assignedProjects(assignment).some((p) => p.id === projectId) : false;
}

/**
 * Whether a host has a schedule for what is outside its projects. An empty expression means
 * it has none; `null` inherits the default from the settings, which is assumed to be set.
 */
export function hostHasSchedule(client: Client | undefined): boolean {
    return client?.autoUpdateCron !== "";
}

/** The key a container is found under in an assignment: unique across the fleet. */
export function containerKey(clientId: string, containerId: string): string {
    return `${clientId}/${containerId}`;
}

/**
 * Every host with the containers it reports and the identity a project query matches
 * against. Loads the Docker state of every client it does not have yet.
 */
export function useHostStates(): QueryHostState[] {
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
    const clients = useClientStore((s) => s.clients);

    useEffect(() => {
        clients.forEach((c) => fetchDockerState(c.id));
    }, [clients, fetchDockerState]);

    return useMemo(() => {
        const byId = new Map(clients.map((c) => [c.id, c]));
        return Object.entries(dockerStates).map(([clientId, state]) => {
            const client = byId.get(clientId);
            return {
                clientId,
                host: {
                    hostname: client?.hostname ?? null,
                    displayName: client?.displayName ?? null,
                },
                containers: state.containers,
            };
        });
    }, [clients, dockerStates]);
}

/**
 * The project every container of the fleet belongs to, keyed by `containerKey` -- or the
 * projects it conflicts between. Containers in no project are not in the map.
 *
 * Derived from the Docker state the store already holds rather than fetched: the states
 * arrive over the WebSocket, so a container that starts or stops matching a query moves
 * here without anything being asked for again. The server and the agents resolve the same
 * thing with the same function from `@dim/shared`.
 */
export function useProjectAssignment(): Map<string, ContainerAssignment> {
    const states = useHostStates();
    const projects = useProjectStore((s) => s.projects);

    return useMemo(() => {
        const assignment = new Map<string, ContainerAssignment>();
        if (projects.length === 0) return assignment;
        for (const state of states) {
            for (const container of state.containers) {
                const resolved = resolveAssignment(projects, state.host, container);
                if (resolved.kind !== "none") {
                    assignment.set(containerKey(state.clientId, container.id), resolved);
                }
            }
        }
        return assignment;
    }, [states, projects]);
}

/**
 * Project membership for every managed project, keyed by project id. A container in conflict
 * is a member of every project it matches, and counted as a conflict in each.
 */
export function useAllProjectMembers(): Map<string, ProjectMembers> {
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const assignment = useProjectAssignment();

    return useMemo(() => {
        const byProject = new Map<
            string,
            { perClient: ProjectClientMembers[]; images: Set<string>; conflicts: number }
        >();

        for (const [clientId, state] of Object.entries(dockerStates)) {
            const containersHere = new Map<string, DockerContainer[]>();
            const conflictsHere = new Map<string, number>();
            for (const container of state.containers) {
                const assigned = assignment.get(containerKey(clientId, container.id));
                if (!assigned) continue;
                for (const project of assignedProjects(assigned)) {
                    const list = containersHere.get(project.id) ?? [];
                    list.push(container);
                    containersHere.set(project.id, list);
                    if (assigned.kind === "conflict") {
                        conflictsHere.set(project.id, (conflictsHere.get(project.id) ?? 0) + 1);
                    }
                }
            }

            for (const [projectId, containers] of containersHere) {
                let entry = byProject.get(projectId);
                if (!entry) {
                    entry = { perClient: [], images: new Set(), conflicts: 0 };
                    byProject.set(projectId, entry);
                }
                entry.conflicts += conflictsHere.get(projectId) ?? 0;

                // One image per distinct configImage, not per container: a project that runs
                // two containers off the same image has one image in it.
                const refs = new Set<string>();
                for (const container of containers) {
                    const ref = container.configImage ?? container.image;
                    if (ref) {
                        refs.add(ref);
                        entry.images.add(ref);
                    }
                }
                const images = state.images.filter((img) =>
                    img.repoTags.some((tag) => refs.has(tag)),
                );

                entry.perClient.push({ clientId, containers, images });
            }
        }

        const result = new Map<string, ProjectMembers>();
        for (const [projectId, { perClient, images, conflicts }] of byProject) {
            result.set(projectId, {
                perClient,
                clientIds: perClient.map((m) => m.clientId),
                containerCount: perClient.reduce((sum, m) => sum + m.containers.length, 0),
                imageCount: images.size,
                conflictCount: conflicts,
            });
        }
        return result;
    }, [dockerStates, assignment]);
}
