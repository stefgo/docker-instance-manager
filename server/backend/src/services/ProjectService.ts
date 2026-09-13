import cron from "node-cron";
import {
    COMPOSE_PROJECT_LABEL,
    DockerContainer,
    Project,
    ProjectListResponse,
    ProjectSummary,
    WS_EVENTS,
} from "@dim/shared";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ProxyService } from "./ProxyService.js";

/** The members of one project, keyed by client. */
export interface ProjectMembers {
    clientIds: string[];
    containers: Array<{ clientId: string; container: DockerContainer }>;
    /** Distinct `configImage` values, which is what a stack is updated by. */
    images: string[];
}

function projectNameOf(container: DockerContainer): string | null {
    const name = container.labels?.[COMPOSE_PROJECT_LABEL];
    return name && name.length > 0 ? name : null;
}

/**
 * Projects are a Compose stack seen across the whole fleet. Membership lives nowhere but in
 * the Docker state the agents report: every answer here is resolved from it on the spot, so
 * a container that leaves a stack leaves the project without anything being cleaned up.
 */
export class ProjectService {
    static list(): Project[] {
        return ProjectRepository.list();
    }

    /** Every Compose project name currently visible on any host, sorted. */
    static discoverNames(): string[] {
        const names = new Set<string>();
        for (const { containers } of DockerStateRepository.getAllClientStates()) {
            for (const container of containers) {
                const name = projectNameOf(container);
                if (name) names.add(name);
            }
        }
        return [...names].sort();
    }

    static getMembers(name: string): ProjectMembers {
        const clientIds: string[] = [];
        const containers: Array<{ clientId: string; container: DockerContainer }> = [];
        const images = new Set<string>();

        for (const state of DockerStateRepository.getAllClientStates()) {
            let hit = false;
            for (const container of state.containers) {
                if (projectNameOf(container) !== name) continue;
                hit = true;
                containers.push({ clientId: state.clientId, container });
                const image = container.configImage ?? container.image;
                if (image) images.add(image);
            }
            if (hit) clientIds.push(state.clientId);
        }

        return { clientIds, containers, images: [...images].sort() };
    }

    /** The stored projects, each with what the current Docker state says about it. */
    static listWithMembers(): ProjectSummary[] {
        return ProjectRepository.list().map((project) => {
            const members = this.getMembers(project.name);
            return {
                ...project,
                clientIds: members.clientIds,
                containerCount: members.containers.length,
                imageCount: members.images.length,
            };
        });
    }

    /**
     * What `GET /api/v1/projects` answers: the managed projects and the names seen on the
     * hosts that have no entry yet.
     */
    static listResponse(): ProjectListResponse {
        const projects = this.listWithMembers();
        const known = new Set(projects.map((p) => p.name));
        return {
            projects,
            discovered: this.discoverNames().filter((n) => !known.has(n)),
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
