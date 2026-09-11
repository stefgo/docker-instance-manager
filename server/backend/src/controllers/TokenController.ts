import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { TokenRepository } from "../repositories/TokenRepository.js";
import { ClientRepository } from "../repositories/ClientRepository.js";

import { ProxyService } from "../services/ProxyService.js";

export const TokenController = {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
        const tokens = TokenRepository.findAll();
        return tokens.map((t) => ({
            ...t,
            createdAt: t.created_at,
            expiresAt: t.expires_at,
            usedAt: t.used_at,
        }));
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        TokenRepository.create(token, expiresAt);
        return { token, expiresAt };
    },

    delete: async (request: FastifyRequest, reply: FastifyReply) => {
        const { token } = request.params as { token: string };
        TokenRepository.delete(token);
        return { status: "deleted" };
    },

    register: async (request: FastifyRequest, reply: FastifyReply) => {
        const { token } = request.body as any;
        const tokenRow = TokenRepository.findValidByToken(token);

        if (!tokenRow) {
            return reply.code(403).send({ error: "Invalid or expired token" });
        }

        try {
            const hostname = (request.body as any).hostname || "unknown";

            // The server issues the identity, both halves of it. A clientId in the body (sent
            // by older agents) is ignored: the id used to be taken from the caller and upserted,
            // so anyone holding a registration token could name an existing client and have
            // its auth token replaced — taking over that host's Docker socket.
            const clientId = crypto.randomUUID();
            const authToken = crypto.randomBytes(64).toString("hex");

            // Capture IP (Requires trustProxy: true in Fastify config if behind proxy)
            const registeredIp = request.ip;

            TokenRepository.markUsed(token);

            ClientRepository.createInbound(clientId, hostname, authToken, registeredIp);

            ProxyService.broadcastClientUpdate();

            return { token: authToken, clientId };
        } catch (e: unknown) {
            request.log.error({ err: e }, "Registration failed");
            return reply.code(500).send({ error: "Registration failed" });
        }
    },
};
