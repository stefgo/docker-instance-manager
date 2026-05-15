import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { ProxyService } from "../services/ProxyService.js";
import { ClientConnector } from "../services/ClientConnector.js";
import { ClientRepository } from "../repositories/ClientRepository.js";

export class ClientController {
    /**
     * Retrieves a list of all clients combined with their live WebSocket connection status.
     */
    static async list(_request: FastifyRequest, _reply: FastifyReply) {
        return ProxyService.getClientsWithStatus();
    }

    /**
     * Attempts registration and AUTH handshake with the client first.
     * Only writes to the database if the connection was fully established.
     */
    static async createOutbound(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as any;
        const { hostname, outboundTargetAddress, registrationSecret } = body;

        if (!outboundTargetAddress || !registrationSecret) {
            return reply.code(400).send({ error: "Missing outboundTargetAddress or registrationSecret" });
        }

        const id = randomUUID();
        const resolvedHostname = hostname?.trim() || outboundTargetAddress;

        const connected = await ClientConnector.firstConnect(
            id,
            outboundTargetAddress,
            registrationSecret,
            (authToken, version) => {
                ClientRepository.createOutbound(id, resolvedHostname, outboundTargetAddress, authToken);
                ClientRepository.updateAuthSuccess(id, version);
            },
        );

        if (!connected) {
            return reply.code(503).send({ error: "Could not establish connection to client" });
        }

        ProxyService.broadcastClientUpdate();
        return { id, hostname: resolvedHostname };
    }

    /**
     * Deletes a client from the database. If the client is currently connected,
     * immediately terminates their WebSocket session.
     */
    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const client = ClientRepository.findById(clientId);

        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }

        // Cancel any pending reconnects for outbound clients
        if (client.connection_mode === "outbound") {
            ClientConnector.disconnectClient(clientId);
        }

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

    /**
     * Triggers an immediate reconnect attempt for an offline outbound client.
     * Cancels any pending backoff timer and resets the attempt counter first.
     */
    static async reconnect(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const client = ClientRepository.findById(clientId);

        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }

        if (client.connection_mode !== "outbound") {
            return reply.code(400).send({ error: "Client is not an outbound client" });
        }

        ClientConnector.disconnectClient(clientId);
        ClientConnector.connectClient(client);

        return { status: "reconnecting" };
    }

    /**
     * Updates a client's display name.
     */
    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = request.body as { displayName?: string };

        if (body.displayName === undefined) {
            return reply.code(400).send({ error: "displayName is required" });
        }

        const info = ClientRepository.updateDisplayName(clientId, body.displayName);
        if (info.changes === 0) {
            return reply.code(404).send({ error: "Client not found" });
        }

        ProxyService.broadcastClientUpdate();
        return { success: true };
    }
}
