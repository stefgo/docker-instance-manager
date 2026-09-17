import cron from "node-cron";
import {
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
    composeProjectOf,
    containerNameOf,
    findQueryConflicts,
    resolveQuery,
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
     * What `GET /api/v1/projects` answers: the managed projects and the Compose project names
     * whose containers belong to no project yet.
     */
    static listResponse(): ProjectListResponse {
        const projects = this.listWithMembers();
        const discovered = new Set<string>();
        for (const state of this.hostStates()) {
            for (const container of state.containers) {
                const name = composeProjectOf(container);
                if (name && resolveAssignment(projects, state.host, container).kind === "none") {
                    discovered.add(name);
                }
            }
        }
        return { projects, discovered: [...discovered].sort() };
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
