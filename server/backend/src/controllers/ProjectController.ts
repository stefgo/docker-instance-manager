import { FastifyReply, FastifyRequest } from "fastify";
import { CreateProjectSchema, UpdateProjectSchema, firstIssue } from "@dim/shared";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { ProjectService } from "../services/ProjectService.js";
import { AutoUpdatePolicyService } from "../services/AutoUpdatePolicyService.js";

/** A schedule has to be a schedule -- `null` (inherit) is allowed, nonsense is not. */
/**
 * A project is global, so every change to one changes what some agent has to do. Both the
 * dashboard and the agents are told: the dashboard so the page redraws, the agents because
 * they are the ones that run the schedule.
 */
function announce(): void {
    ProjectService.broadcast();
    AutoUpdatePolicyService.broadcast();
}

function cronIssue(cron: string | null): string | null {
    if (cron === null) return null;
    return ProjectService.validateCron(cron).valid ? null : "Invalid cron expression";
}

export class ProjectController {
    static async list(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(ProjectService.listResponse());
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const parsed = CreateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const cron = ProjectService.normaliseCron(parsed.data.cron);
        const issue = cronIssue(cron);
        if (issue) return reply.code(400).send({ error: issue });

        const project = ProjectRepository.add(parsed.data.name, parsed.data.autoUpdate, cron);
        if (!project) {
            return reply.code(409).send({ error: "A project of that name already exists" });
        }
        announce();
        return reply.code(201).send(project);
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { name } = request.params as { name: string };
        const parsed = UpdateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }

        // `cron: null` means "inherit" and is a change; a missing `cron` is not.
        const changes: { autoUpdate?: boolean; cron?: string | null } = {};
        if (parsed.data.autoUpdate !== undefined) changes.autoUpdate = parsed.data.autoUpdate;
        if (parsed.data.cron !== undefined) {
            const cron = ProjectService.normaliseCron(parsed.data.cron);
            const issue = cronIssue(cron);
            if (issue) return reply.code(400).send({ error: issue });
            changes.cron = cron;
        }

        const project = ProjectRepository.update(decodeURIComponent(name), changes);
        if (!project) return reply.code(404).send({ error: "Project not found" });
        announce();
        return reply.send(project);
    }

    /**
     * Removes the DIM entry only. Nothing on any host is touched -- the stack keeps running,
     * and its name shows up among the discovered projects again.
     */
    static async remove(request: FastifyRequest, reply: FastifyReply) {
        const { name } = request.params as { name: string };
        const removed = ProjectRepository.remove(decodeURIComponent(name));
        if (!removed) return reply.code(404).send({ error: "Project not found" });
        announce();
        return reply.send({ ok: true });
    }
}
