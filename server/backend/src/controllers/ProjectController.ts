import { FastifyReply, FastifyRequest } from "fastify";
import {
    CreateProjectSchema,
    ProjectPreviewRequestSchema,
    ProjectQueryConflict,
    UpdateProjectSchema,
    firstIssue,
} from "@dim/shared";
import { ProjectChanges, ProjectRepository } from "../repositories/ProjectRepository.js";
import { ProjectService } from "../services/ProjectService.js";
import { AutoUpdatePolicyService } from "../services/AutoUpdatePolicyService.js";

/**
 * A project is global, so every change to one changes what some agent has to do. Both the
 * dashboard and the agents are told: the dashboard so the page redraws, the agents because
 * they are the ones that run the schedule.
 */
function announce(): void {
    ProjectService.broadcast();
    AutoUpdatePolicyService.broadcast();
}

/** A schedule has to be a schedule -- `null` (inherit) is allowed, nonsense is not. */
function cronIssue(cron: string | null): string | null {
    if (cron === null) return null;
    return ProjectService.validateCron(cron).valid ? null : "Invalid cron expression";
}

/**
 * A container belongs to one project at most, so a query that would take containers another
 * project already has is refused. The answer names them, so the editor can show which.
 */
function conflictReply(reply: FastifyReply, conflicts: ProjectQueryConflict[]) {
    const projects = [...new Set(conflicts.map((c) => c.projectName))];
    return reply.code(409).send({
        error: `The query matches ${conflicts.length} container(s) that already belong to ${projects.join(", ")}`,
        conflicts,
    });
}

export class ProjectController {
    static async list(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(ProjectService.listResponse());
    }

    static async preview(request: FastifyRequest, reply: FastifyReply) {
        const parsed = ProjectPreviewRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        return reply.send(ProjectService.preview(parsed.data.query, parsed.data.excludeId));
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const parsed = CreateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const cron = ProjectService.normaliseCron(parsed.data.cron);
        const issue = cronIssue(cron);
        if (issue) return reply.code(400).send({ error: issue });

        if (ProjectRepository.nameTaken(parsed.data.name)) {
            return reply.code(409).send({ error: "A project of that name already exists" });
        }
        const conflicts = ProjectService.conflictsOf(parsed.data.query);
        if (conflicts.length > 0) return conflictReply(reply, conflicts);

        const project = ProjectRepository.add({
            name: parsed.data.name,
            query: parsed.data.query,
            autoUpdate: parsed.data.autoUpdate,
            cron,
        });
        announce();
        return reply.code(201).send(project);
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const parsed = UpdateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        if (!ProjectRepository.findById(id)) {
            return reply.code(404).send({ error: "Project not found" });
        }

        // `cron: null` means "inherit" and is a change; a missing `cron` is not.
        const changes: ProjectChanges = {};
        if (parsed.data.name !== undefined) {
            if (ProjectRepository.nameTaken(parsed.data.name, id)) {
                return reply.code(409).send({ error: "A project of that name already exists" });
            }
            changes.name = parsed.data.name;
        }
        if (parsed.data.query !== undefined) {
            const conflicts = ProjectService.conflictsOf(parsed.data.query, id);
            if (conflicts.length > 0) return conflictReply(reply, conflicts);
            changes.query = parsed.data.query;
        }
        if (parsed.data.autoUpdate !== undefined) changes.autoUpdate = parsed.data.autoUpdate;
        if (parsed.data.cron !== undefined) {
            const cron = ProjectService.normaliseCron(parsed.data.cron);
            const issue = cronIssue(cron);
            if (issue) return reply.code(400).send({ error: issue });
            changes.cron = cron;
        }

        const project = ProjectRepository.update(id, changes);
        if (!project) return reply.code(404).send({ error: "Project not found" });
        announce();
        return reply.send(project);
    }

    /**
     * Removes the DIM entry only. Nothing on any host is touched -- the containers keep
     * running and simply belong to no project any more.
     */
    static async remove(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const removed = ProjectRepository.remove(id);
        if (!removed) return reply.code(404).send({ error: "Project not found" });
        announce();
        return reply.send({ ok: true });
    }
}
