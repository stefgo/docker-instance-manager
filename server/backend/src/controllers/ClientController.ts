import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { ProxyService } from "../services/ProxyService.js";
import { ClientConnector } from "../services/ClientConnector.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import {
    CONNECTION_MODE,
    CreateOutboundClientSchema,
    UpdateClientSchema,
    firstIssue,
} from "@dim/shared";

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
        const parsed = CreateOutboundClientSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { hostname, outboundTargetAddress, registrationSecret } = parsed.data;

        const id = randomUUID();
        const resolvedHostname = hostname?.trim() || outboundTargetAddress;

        const result = await ClientConnector.firstConnect(
            id,
            outboundTargetAddress,
            registrationSecret,
            (authToken, version) => {
                ClientRepository.createOutbound(id, resolvedHostname, outboundTargetAddress, authToken);
                ClientRepository.updateAuthSuccess(id, version);
            },
        );

        if (!result.ok) {
            // The reason comes from the handshake with the agent (e.g. "already registered"),
            // so the operator can act on it instead of guessing.
            const reason = result.error ?? "Unknown error.";
            return reply.code(503).send({ error: `Could not establish connection to client. ${reason}` });
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
        if (client.connection_mode === CONNECTION_MODE.OUTBOUND) {
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

        if (client.connection_mode !== CONNECTION_MODE.OUTBOUND) {
            return reply.code(400).send({ error: "Client is not an outbound client" });
        }

        ClientConnector.disconnectClient(clientId);
        ClientConnector.connectClient(client);

        return { status: "reconnecting" };
    }

    /**
     * Updates a client's display name and, for inbound clients, the address or network its
     * connections must come from. `inboundAllowedIp: null` switches that check off; an
     * absent key leaves it alone.
     */
    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const parsed = UpdateClientSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { displayName, inboundAllowedIp } = parsed.data;

        const client = ClientRepository.findById(clientId);
        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }
        if (
            inboundAllowedIp !== undefined &&
            client.connection_mode === CONNECTION_MODE.OUTBOUND
        ) {
            return reply.code(400).send({
                error: "inboundAllowedIp: Only inbound clients have an allowed address",
            });
        }

        if (displayName !== undefined) {
            ClientRepository.updateDisplayName(clientId, displayName);
        }
        if (inboundAllowedIp !== undefined) {
            ClientRepository.updateInboundAllowedIp(clientId, inboundAllowedIp);
        }

        ProxyService.broadcastClientUpdate();
        return { success: true };
    }
}
