import cron from "node-cron";
import {
    ActivitySubject,
    DockerContainer,
    Project,
    ProjectListResponse,
    ProjectPreviewResponse,
    ProjectQuery,
    ProjectQueryConflict,
    ProjectSummary,
    QueryHostState,
    WS_EVENTS,
    assignedProjects,
    resolveAssignment,
    containerNameOf,
    findQueryConflicts,
    resolveQuery,
    splitImageRef,
} from "@dim/shared";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ProxyService } from "./ProxyService.js";

/**
 * Projects are groups of containers across the whole fleet, defined by a query. Membership
 * lives nowhere but in the Docker state the agents report: every answer here is resolved
 * from it on the spot, so a container that stops matching leaves the project without
 * anything being cleaned up.
 */
export class ProjectService {
    static list(): Project[] {
        return ProjectRepository.list();
    }

    /** Every reported host with its containers and the identity a query matches against. */
    static hostStates(): QueryHostState[] {
        const clients = new Map(ClientRepository.findAll().map((c) => [c.id, c]));
        return DockerStateRepository.getAllClientStates().map((state) => {
            const client = clients.get(state.clientId);
            return {
                clientId: state.clientId,
                host: {
                    hostname: client?.hostname ?? null,
                    displayName: client?.display_name ?? null,
                },
                containers: state.containers,
            };
        });
    }

    /**
     * The stored projects, each with the containers its query matches right now. A container
     * that matches several projects is counted in each of them, and as a conflict.
     */
    static listWithMembers(): ProjectSummary[] {
        const projects = ProjectRepository.list();
        const members = new Map(
            projects.map((p) => [
                p.id,
                { clientIds: new Set<string>(), containers: 0, conflicts: 0, images: new Set<string>() },
            ]),
        );

        for (const state of this.hostStates()) {
            for (const container of state.containers) {
                const assignment = resolveAssignment(projects, state.host, container);
                for (const project of assignedProjects(assignment)) {
                    const entry = members.get(project.id)!;
                    entry.clientIds.add(state.clientId);
                    entry.containers++;
                    if (assignment.kind === "conflict") entry.conflicts++;
                    const image = container.configImage ?? container.image;
                    if (image) entry.images.add(image);
                }
            }
        }

        return projects.map((project) => {
            const entry = members.get(project.id)!;
            return {
                ...project,
                clientIds: [...entry.clientIds],
                containerCount: entry.containers,
                imageCount: entry.images.size,
                conflictCount: entry.conflicts,
            };
        });
    }

    /**
     * Resolves which projects activity events are about, against the projects and the host
     * states as they are now. Returned as a function so a batch of events reads the database
     * once, not once per event.
     *
     * - An event about a container takes the projects of that container, found by id or else
     *   by name in its host's last state. A container that is gone by then -- the event of a
     *   removal, or one delivered after an offline stretch -- is matched from what the event
     *   itself says about it, as long as it names both the container and its image: without
     *   the image, a negated image criterion would match the missing attribute.
     * - An event about an image alone takes the projects of every container on that host
     *   configured with that reference.
     * - An event about neither, or without a host, is about no project.
     */
    static activityProjectResolver(): (clientId: string | null | undefined, subject: ActivitySubject | null | undefined) => string[] {
        const projects = ProjectRepository.list();
        if (projects.length === 0) return () => [];
        const states = new Map(this.hostStates().map((s) => [s.clientId, s]));
        const hosts = new Map(
            ClientRepository.findAll().map((c) => [
                c.id,
                { hostname: c.hostname ?? null, displayName: c.display_name ?? null },
            ]),
        );
        const refKey = (ref: string) => {
            const { repository, tag } = splitImageRef(ref);
            return `${repository}:${tag}`.toLowerCase();
        };
        const idsOf = (host: QueryHostState["host"], container: DockerContainer) =>
            assignedProjects(resolveAssignment(projects, host, container)).map((p) => p.id);

        return (clientId, subject) => {
            if (!clientId || !subject) return [];
            const state = states.get(clientId);
            const host = state?.host ?? hosts.get(clientId);
            if (!host) return [];
            const containers = state?.containers ?? [];
            const name = subject.containerName?.replace(/^\//, "");

            if (subject.containerId || name) {
                const container =
                    (subject.containerId && containers.find((c) => c.id === subject.containerId)) ||
                    (name && containers.find((c) => containerNameOf(c) === name)) ||
                    null;
                if (container) return idsOf(host, container);
                if (!name || !subject.imageRef) return [];
                return idsOf(host, {
                    id: subject.containerId ?? name,
                    names: [`/${name}`],
                    image: subject.imageRef,
                    configImage: subject.imageRef,
                    imageId: "",
                    command: "",
                    created: 0,
                    state: "",
                    ports: [],
                    labels: {},
                });
            }

            if (subject.imageRef) {
                const key = refKey(subject.imageRef);
                const ids = new Set<string>();
                for (const container of containers) {
                    const ref = container.configImage ?? container.image;
                    if (ref && refKey(ref) === key) {
                        for (const id of idsOf(host, container)) ids.add(id);
                    }
                }
                return [...ids];
            }

            return [];
        };
    }

    /** What `GET /api/v1/projects` answers: the managed projects with their members. */
    static listResponse(): ProjectListResponse {
        return { projects: this.listWithMembers() };
    }

    /** The containers a query shares with projects other than `excludeId`. */
    static conflictsOf(query: ProjectQuery, excludeId?: string): ProjectQueryConflict[] {
        return findQueryConflicts(query, ProjectRepository.list(), this.hostStates(), excludeId);
    }

    static preview(query: ProjectQuery, excludeId?: string): ProjectPreviewResponse {
        const states = this.hostStates();
        return {
            members: resolveQuery(query, states).map(({ clientId, container }) => ({
                clientId,
                containerId: container.id,
                containerName: containerNameOf(container),
            })),
            conflicts: findQueryConflicts(query, ProjectRepository.list(), states, excludeId),
        };
    }

    /**
     * An empty expression is not a schedule but the absence of one, and is stored as `null`
     * ("inherit"). Auto-update is switched off through `autoUpdate`.
     */
    static normaliseCron(cron: string | null | undefined): string | null {
        if (cron === undefined || cron === null) return null;
        const expr = cron.trim();
        return expr.length > 0 ? expr : null;
    }

    static validateCron(expression: string): { valid: boolean } {
        const expr = (expression ?? "").trim();
        if (!expr) return { valid: false };
        try {
            return { valid: cron.validate(expr) };
        } catch {
            return { valid: false };
        }
    }

    static broadcast(): void {
        ProxyService.broadcastToDashboard({
            type: WS_EVENTS.PROJECTS_UPDATE,
            payload: this.listResponse(),
        });
    }
}
