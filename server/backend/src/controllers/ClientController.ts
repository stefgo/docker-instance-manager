import { FastifyReply, FastifyRequest } from "fastify";
import { ProxyService } from "../services/ProxyService.js";
import { WS_EVENTS, ClientSchema } from "@dim/shared";
import { ClientRepository } from "../repositories/ClientRepository.js";

export class ClientController {
    /**
     * Retrieves a list of all clients combined with their live WebSocket connection status.
     * @param request - Fastify request
     * @param reply - Fastify reply
     */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return ProxyService.getClientsWithStatus();
    }

    /**
     * Deletes a client from the database. If the client is currently connected,
     * immediately terminates their WebSocket session.
     * @param request - Fastify request containing the clientId in params
     * @param reply - Fastify reply
     */
    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const info = ClientRepository.delete(clientId);

        if (info.changes === 0) {
            return reply.code(404).send({ error: "Client not found" });
        }

        // Disconnect if online
        const socket = ProxyService.getClientSocket(clientId);
        if (socket) {
            socket.close(4000, "Client deleted");
            ProxyService.unregisterClient(clientId, socket);
        }

        ProxyService.broadcastClientUpdate();
        return { status: "deleted" };
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const parsed = ClientSchema.pick({ displayName: true }).safeParse(
            request.body,
        );
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: parsed.error.issues[0].message });
        }
        const body = parsed.data;

        try {
            const updated = ProxyService.updateClient(clientId, body);
            if (!updated) {
                return reply.code(404).send({ error: "Client not found" });
            }
            return { success: true };
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }
}
