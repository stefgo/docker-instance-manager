import { FastifyReply, FastifyRequest } from "fastify";
import { NotificationService } from "../services/NotificationService.js";

export class NotificationController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return NotificationService.list();
    }

    static async markSeen(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const userId = (request.user as any).id;
        const ok = NotificationService.markSeen(id, userId);
        if (!ok) return reply.code(404).send({ error: "Notification not found" });
        return { ok: true };
    }

    static async markAllSeen(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.user as any).id;
        NotificationService.markAllSeen(userId);
        return { ok: true };
    }

    static async deleteOne(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const ok = NotificationService.delete(id);
        if (!ok) return reply.code(404).send({ error: "Notification not found" });
        return { ok: true };
    }

    static async deleteAll(request: FastifyRequest, reply: FastifyReply) {
        NotificationService.deleteAll();
        return { ok: true };
    }
}
