import WebSocket from "ws";
import { randomUUID } from "crypto";
import { WS_EVENTS } from "@dim/shared";
import { logger } from "../core/logger.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { WebSocketController } from "../controllers/WebSocketController.js";

const RECONNECT_DELAYS = [5000, 10000, 30000, 60000];

export class ClientConnector {
    private static reconnectTimers = new Map<string, NodeJS.Timeout>();
    private static reconnectAttempts = new Map<string, number>();

    /**
     * Connects to all outbound clients stored in the database that already have an authToken.
     * Registration cannot be retried on startup — it requires the secret from the UI.
     */
    static async connectAll(): Promise<void> {
        const clients = ClientRepository.findOutboundClients();
        const ready = clients.filter((c: any) => c.auth_token);
        logger.info(`ClientConnector: connecting to ${ready.length} outbound client(s) on startup`);
        for (const client of ready) {
            await this.connectClient(client);
        }
    }

    /**
     * First-time connection for a new outbound client that is not yet in the database.
     * Performs registration (if no authToken yet) and the full AUTH handshake.
     * Calls onPersist(authToken, version) only on AUTH success — the caller must write to DB there.
     * Returns true if AUTH succeeded, false otherwise. Nothing is written to DB on failure.
     */
    static async firstConnect(
        id: string,
        outboundTargetAddress: string,
        registrationSecret: string,
        onPersist: (authToken: string, version: string | null) => void,
    ): Promise<boolean> {
        const authToken = await this.performRegistration(outboundTargetAddress, registrationSecret);
        if (!authToken) return false;

        return this.connectWithToken(id, outboundTargetAddress, authToken, onPersist);
    }

    /**
     * Performs the registration handshake and returns the authToken on success, or null on failure.
     * Does not write anything to the database.
     */
    private static async performRegistration(
        outboundTargetAddress: string,
        registrationSecret: string,
    ): Promise<string | null> {
        const wsUrl = `ws://${outboundTargetAddress}/ws/register`;
        logger.info({ url: wsUrl }, "ClientConnector: starting registration");

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error({ err }, "ClientConnector: failed to create registration socket");
                resolve(null);
                return;
            }

            const authToken = randomUUID();
            const timeout = setTimeout(() => {
                ws.terminate();
                logger.warn("ClientConnector: registration timed out");
                resolve(null);
            }, 10000);

            ws.on("open", () => {
                ws.send(JSON.stringify({
                    type: WS_EVENTS.REGISTRATION_REQUEST,
                    payload: { secret: registrationSecret, authToken },
                }));
            });

            ws.on("message", (data: WebSocket.RawData) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === WS_EVENTS.REGISTRATION_SUCCESS) {
                        clearTimeout(timeout);
                        logger.info("ClientConnector: registration successful");
                        ws.close(1000, "Registration complete");
                        resolve(authToken);
                    } else if (message.type === WS_EVENTS.REGISTRATION_FAILURE) {
                        clearTimeout(timeout);
                        logger.error("ClientConnector: client rejected registration secret");
                        ws.close();
                        resolve(null);
                    }
                } catch (err) {
                    clearTimeout(timeout);
                    logger.error({ err }, "ClientConnector: error parsing registration response");
                    ws.close();
                    resolve(null);
                }
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                logger.error({ err: err.message }, "ClientConnector: registration connection error");
                resolve(null);
            });

            ws.on("close", () => {
                clearTimeout(timeout);
            });
        });
    }

    /**
     * Opens an agent WebSocket connection using the given authToken (client not necessarily in DB).
     * Calls onPersist(version) on AUTH success before the client is registered in ProxyService.
     */
    private static async connectWithToken(
        id: string,
        outboundTargetAddress: string,
        authToken: string,
        onPersist: (authToken: string, version: string | null) => void,
    ): Promise<boolean> {
        const wsUrl = `ws://${outboundTargetAddress}/ws/agent?token=${authToken}`;
        logger.info({ clientId: id, url: `ws://${outboundTargetAddress}/ws/agent` }, "ClientConnector: connecting");

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error({ err, clientId: id }, "ClientConnector: failed to create socket");
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                ws.terminate();
                logger.warn({ clientId: id }, "ClientConnector: connection timed out");
                resolve(false);
            }, 10000);

            ws.on("open", () => {
                clearTimeout(timeout);
                this.reconnectAttempts.delete(id);
                WebSocketController.handleOutboundAgentConnection(
                    id,
                    ws,
                    () => this.scheduleReconnect(id),
                    (authSuccess) => resolve(authSuccess),
                    (version) => onPersist(authToken, version),
                );
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                logger.error({ err: err.message, clientId: id }, "ClientConnector: connection error");
                resolve(false);
            });
        });
    }

    /**
     * Reconnects an existing outbound client that is already stored in the database.
     * registrationSecret is only needed if the client has no authToken yet.
     */
    static async connectOrRegister(client: any, registrationSecret?: string): Promise<boolean> {
        if (!client.outbound_target_address) {
            logger.warn({ clientId: client.id }, "ClientConnector: missing outbound_target_address, skipping");
            return false;
        }

        if (!client.auth_token) {
            if (!registrationSecret) {
                logger.warn({ clientId: client.id }, "ClientConnector: no registration secret provided, cannot register");
                return false;
            }
            return await this.registerClient(client, registrationSecret);
        } else {
            return await this.connectClient(client);
        }
    }

    /**
     * Registration + connect for an existing DB client (e.g. re-registration after token loss).
     * Writes authToken to DB after successful registration.
     */
    private static async registerClient(client: any, registrationSecret: string): Promise<boolean> {
        const authToken = await this.performRegistration(client.outbound_target_address, registrationSecret);
        if (!authToken) {
            this.scheduleReconnect(client.id);
            return false;
        }

        ClientRepository.updateAuthToken(client.id, authToken);
        const updatedClient = ClientRepository.findById(client.id);
        return this.connectClient(updatedClient);
    }

    /**
     * Opens a regular agent connection for a client already stored in the database.
     */
    static async connectClient(client: any): Promise<boolean> {
        if (!client.outbound_target_address || !client.auth_token) {
            logger.warn({ clientId: client.id }, "ClientConnector: missing fields, cannot connect");
            return false;
        }

        const wsUrl = `ws://${client.outbound_target_address}/ws/agent?token=${client.auth_token}`;
        logger.info({ clientId: client.id, url: `ws://${client.outbound_target_address}/ws/agent` }, "ClientConnector: connecting");

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error({ err, clientId: client.id }, "ClientConnector: failed to create socket");
                this.scheduleReconnect(client.id);
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                ws.terminate();
                logger.warn({ clientId: client.id }, "ClientConnector: connection timed out");
                this.scheduleReconnect(client.id);
                resolve(false);
            }, 10000);

            ws.on("open", () => {
                clearTimeout(timeout);
                this.reconnectAttempts.delete(client.id);
                WebSocketController.handleOutboundAgentConnection(
                    client.id,
                    ws,
                    () => this.scheduleReconnect(client.id),
                    (authSuccess) => resolve(authSuccess),
                );
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                logger.error({ err: err.message, clientId: client.id }, "ClientConnector: connection error");
                this.scheduleReconnect(client.id);
                resolve(false);
            });
        });
    }

    /**
     * Schedules a reconnect attempt with exponential backoff.
     */
    static scheduleReconnect(clientId: string): void {
        if (this.reconnectTimers.has(clientId)) return;

        const attempt = this.reconnectAttempts.get(clientId) ?? 0;
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        this.reconnectAttempts.set(clientId, attempt + 1);

        logger.info({ clientId, delay }, "ClientConnector: scheduling reconnect");

        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(clientId);
            const client = ClientRepository.findById(clientId);
            if (client && client.connection_mode === "outbound") {
                await this.connectOrRegister(client);
            }
        }, delay);

        this.reconnectTimers.set(clientId, timer);
    }

    /**
     * Cancels any pending reconnect for a client.
     */
    static disconnectClient(clientId: string): void {
        const timer = this.reconnectTimers.get(clientId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(clientId);
        }
        this.reconnectAttempts.delete(clientId);
    }
}
