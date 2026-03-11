import { FastifyInstance } from "fastify";
import {
    WS_EVENTS,
    WsMessage,
    ProtocolMap,
    AuthPayloadSchema,
} from "@docker-instance-manager/shared";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { isIpInNetworks } from "../utils/networkUtils.js";
import { ClientRepository } from "../repositories/ClientRepository.js";

export class WebSocketController {
    static async handleDashboardConnection(
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        const socket = connection.socket || connection;
        (socket as any).isAlive = true;

        socket.on("pong", () => {
            (socket as any).isAlive = true;
        });

        const pingInterval = setInterval(() => {
            if ((socket as any).isAlive === false) {
                socket.terminate();
                return;
            }
            (socket as any).isAlive = false;
            socket.ping();
        }, 30000);

        const token = (req.query as any).token;
        if (!token) {
            socket.close(4001, "Unauthorized");
            return;
        }

        try {
            fastify.jwt.verify(token);
        } catch (e) {
            socket.close(4001, "Invalid Token");
            return;
        }

        ProxyService.addDashboardClient(socket);

        // Send initial state
        const clients = ProxyService.getClientsWithStatus();
        socket.send(
            JSON.stringify({ type: "CLIENTS_UPDATE", payload: clients }),
        );

        socket.on("close", () => {
            clearInterval(pingInterval);
            ProxyService.removeDashboardClient(socket);
        });
    }

    static async handleAgentConnection(
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        // Correctly handle IP address with trustProxy (configured in Fastify)
        const clientIp = req.ip;
        fastify.log.info({ msg: "Client connected", ip: clientIp });

        const socket = connection.socket || connection;
        (socket as any).isAlive = true;

        socket.on("pong", () => {
            (socket as any).isAlive = true;
        });

        const pingInterval = setInterval(() => {
            if ((socket as any).isAlive === false) {
                fastify.log.warn({
                    msg: "Agent client connection timed out (no pong). Terminating.",
                    ip: clientIp,
                    clientId,
                });
                socket.terminate();
                return;
            }
            (socket as any).isAlive = false;
            socket.ping();
        }, 30000);

        socket.on("close", () => {
            clearInterval(pingInterval);
        });
        let isAuthenticated = false;
        let clientId: string | null = null;
        let authTimeout: NodeJS.Timeout;

        // AUTHENTICATION LOGIC (Token + IP)
        // 1. Extract Token: Check query params first, then Authorization header.
        // WebSocket connections from browser usually use query params?token=..., agents might use Headers.
        let token = (req.query as any).token;
        if (!token && req.headers["authorization"]) {
            const parts = req.headers["authorization"].split(" ");
            if (parts.length === 2 && parts[0] === "Bearer") {
                token = parts[1];
            }
        }

        if (!token) {
            fastify.log.warn({
                msg: "Client connected without token",
                ip: clientIp,
            });
            socket.close(4001, "Authentication required");
            return;
        }

        const client = ClientRepository.findByToken(token);

        if (!client) {
            fastify.log.warn({ msg: "Invalid token used", ip: clientIp });
            socket.close(4003, "Invalid credentials");
            return;
        }

        // Global Security Check: Allowed Networks
        const allowedNetworks = appConfig.security?.allowed_networks || [];
        if (!isIpInNetworks(clientIp, allowedNetworks, true)) {
            fastify.log.warn({
                msg: "Connection denied: IP not in allowed networks",
                ip: clientIp,
            });
            socket.close(4003, "Access denied");
            return;
        }

        // Strict IP Check (Skip if in trusted networks)
        const trustedNetworks = appConfig.security?.trusted_networks || [];
        const isTrusted = isIpInNetworks(clientIp, trustedNetworks, false);

        if (!isTrusted && client.allowed_ip !== clientIp) {
            fastify.log.warn({
                msg: "IP mismatch for client",
                expected: client.allowed_ip,
                actual: clientIp,
                clientId: client.id,
            });
            socket.close(4003, "IP address mismatch");
            return;
        }

        // Wait for explicit AUTH handshake from Agent (Protocol compatibility)
        // The agent must send { type: 'AUTH' } as its first message to confirm readiness.
        // We enforce a 5-second timeout to prevent zombie connections.

        authTimeout = setTimeout(() => {
            if (!isAuthenticated && socket.readyState === socket.OPEN) {
                fastify.log.warn({
                    msg: "Client authentication timed out",
                    ip: clientIp,
                });
                socket.close(4001, "Authentication timed out");
            }
        }, 5000);

        socket.on("message", (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString()) as WsMessage;

                if (!isAuthenticated) {
                    if (data.type === WS_EVENTS.AUTH) {
                        const parsed = AuthPayloadSchema.safeParse(
                            data.payload,
                        );
                        if (!parsed.success) {
                            socket.close(4000, "Invalid payload");
                            return;
                        }

                        isAuthenticated = true;
                        clientId = client.id;
                        clearTimeout(authTimeout);

                        const authPayload = parsed.data;
                        ClientRepository.updateAuthSuccess(
                            clientId!,
                            clientIp,
                            authPayload.version || null,
                        );

                        fastify.log.info({
                            msg: "Client authenticated",
                            clientId,
                        });
                        ProxyService.registerClient(clientId!, socket);

                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.AUTH_SUCCESS,
                                payload: { lastSyncTime: null },
                            }),
                        );
                        ProxyService.broadcastClientUpdate();

                        socket.on("close", () => {
                            if (clientId) {
                                ClientRepository.updateLastSeen(clientId);
                                ProxyService.unregisterClient(clientId);
                                fastify.log.info({
                                    msg: "Client disconnected",
                                    clientId,
                                });
                                ProxyService.broadcastClientUpdate();
                            }
                        });
                    } else {
                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.AUTH_FAILURE,
                                payload: {},
                            }),
                        );
                        socket.close(4003, "Forbidden");
                    }
                    return;
                }
            } catch (err) {
                fastify.log.error({
                    msg: "Error processing WebSocket message",
                    err,
                });
            }
        });
    }
}
