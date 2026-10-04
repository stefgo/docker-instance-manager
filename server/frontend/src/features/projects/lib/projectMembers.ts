import {
    type Client,
    type DockerContainer,
    type DockerImage,
    type DockerState,
    type ProjectAssignment,
    type ProjectSummary,
    type QueryHostState,
    assignedProjects,
    resolveAssignment,
} from "@dim/shared";
import { isCheckableRef, normalizeImageRef } from "../../images/lib/digest";
import { type UpdateStatus, aggregateUpdateStatus, checkStatus } from "../../images/lib/updateStatus";

/** What one host contributes to a project. */
export interface ProjectClientMembers {
    clientId: string;
    containers: DockerContainer[];
    /** The images behind those containers, resolved through their `configImage`. */
    images: DockerImage[];
}

/**
 * One image reference a project runs on, with everything acting on it needs: the digests a
 * check is keyed by, the hosts a pull has to reach, and how far behind it is. One entry per
 * reference across the fleet -- the registry is asked about the reference, so two hosts on
 * the same image ask the same question once.
 */
export interface ProjectImageTarget {
    imageRef: string;
    repoDigests: string[];
    clientIds: string[];
    /** Per host, the project's containers on this reference: what a pull recreates. */
    containerIds: Record<string, string[]>;
    /** Per host, how current its copy is: a pull of only what is behind goes to these. */
    hostStatus: Record<string, UpdateStatus>;
    updateStatus: UpdateStatus;
}

export interface ProjectMembers {
    perClient: ProjectClientMembers[];
    clientIds: string[];
    containerCount: number;
    /** The images this project is updated by, one per distinct `configImage`. */
    targets: ProjectImageTarget[];
    /** Distinct `configImage` values across every host, which is what a project is updated by. */
    imageCount: number;
    /**
     * The worst status among those images on every host that runs them, so a single host
     * that is behind is visible on the project's own row.
     */
    updateStatus: UpdateStatus;
    /** Members that match another project too, and are updated through neither. */
    conflictCount: number;
}

export const EMPTY_MEMBERS: ProjectMembers = {
    perClient: [],
    clientIds: [],
    containerCount: 0,
    targets: [],
    imageCount: 0,
    updateStatus: "none",
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

/** Every host with the containers it reports and the identity a project query matches against. */
export function hostStates(
    clients: readonly Pick<Client, "id" | "hostname" | "displayName">[],
    dockerStates: Record<string, DockerState>,
): QueryHostState[] {
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
}

/**
 * The project every container of the fleet belongs to, keyed by `containerKey` -- or the
 * projects it conflicts between. Containers in no project are not in the map. The server
 * and the agents resolve the same thing with the same function from `@dim/shared`.
 */
export function projectAssignment(
    states: readonly QueryHostState[],
    projects: readonly ProjectSummary[],
): Map<string, ContainerAssignment> {
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
}

/**
 * Project membership for every managed project, keyed by project id. A container in conflict
 * is a member of every project it matches, and counted as a conflict in each.
 */
export function buildProjectMembers(
    dockerStates: Record<string, DockerState>,
    assignment: ReadonlyMap<string, ContainerAssignment>,
): Map<string, ProjectMembers> {
    const byProject = new Map<
        string,
        {
            perClient: ProjectClientMembers[];
            refs: Map<
                string,
                {
                    digests: Set<string>;
                    clientIds: Set<string>;
                    containerIds: Record<string, string[]>;
                    hostStatus: Record<string, UpdateStatus>;
                }
            >;
            conflicts: number;
        }
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
                entry = {
                    perClient: [],
                    refs: new Map(),
                    conflicts: 0,
                };
                byProject.set(projectId, entry);
            }
            entry.conflicts += conflictsHere.get(projectId) ?? 0;

            // One image per distinct configImage, not per container: a project that runs
            // two containers off the same image has one image in it.
            const refs = new Map<string, string[]>();
            for (const container of containers) {
                // As the host lists it: `nginx` is the image the host calls `nginx:latest`.
                const ref = normalizeImageRef(container.configImage ?? container.image);
                if (ref) refs.set(ref, [...(refs.get(ref) ?? []), container.id]);
            }
            const images = state.images.filter((img) =>
                img.repoTags.some((tag) => refs.has(tag)),
            );

            // What this host contributes to each reference: its copy's digests, itself
            // as a host to pull on, and its own reading of how current the copy is. A
            // reference nobody has checked yet has to stay distinguishable from one that
            // is up to date, so every host reports a status rather than only the ones
            // that found something.
            for (const [ref, containerIds] of refs) {
                let target = entry.refs.get(ref);
                if (!target) {
                    target = { digests: new Set(), clientIds: new Set(), containerIds: {}, hostStatus: {} };
                    entry.refs.set(ref, target);
                }
                target.containerIds[clientId] = containerIds;
                const img = images.find((i) => i.repoTags.includes(ref));
                for (const digest of img?.repoDigests ?? []) target.digests.add(digest);
                target.clientIds.add(clientId);
                target.hostStatus[clientId] = checkStatus(img?.updateCheck, isCheckableRef(ref));
            }

            entry.perClient.push({ clientId, containers, images });
        }
    }

    const result = new Map<string, ProjectMembers>();
    for (const [projectId, { perClient, refs, conflicts }] of byProject) {
        const targets: ProjectImageTarget[] = [...refs].map(([imageRef, t]) => ({
            imageRef,
            repoDigests: [...t.digests],
            clientIds: [...t.clientIds],
            containerIds: t.containerIds,
            hostStatus: t.hostStatus,
            updateStatus: aggregateUpdateStatus(Object.values(t.hostStatus)),
        }));
        result.set(projectId, {
            perClient,
            clientIds: perClient.map((m) => m.clientId),
            containerCount: perClient.reduce((sum, m) => sum + m.containers.length, 0),
            targets,
            imageCount: targets.length,
            updateStatus: aggregateUpdateStatus(targets.map((t) => t.updateStatus)),
            conflictCount: conflicts,
        });
    }
    return result;
}
