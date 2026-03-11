import { WebSocket } from "ws";
import crypto, { randomUUID } from "crypto";
import {
    WS_EVENTS,
    WsMessage,
    ProtocolMap,
} from "@docker-instance-manager/shared";
import { logger } from "../core/logger.js";
import { ClientRepository } from "../repositories/ClientRepository.js";

export class ProxyService {
    private static connectedClients = new Map<string, WebSocket>();
    private static dashboardClients = new Set<WebSocket>();

    static registerClient(clientId: string, socket: WebSocket) {
        this.connectedClients.set(clientId, socket);
    }

    static unregisterClient(clientId: string) {
        this.connectedClients.delete(clientId);
    }

    static addDashboardClient(socket: WebSocket) {
        this.dashboardClients.add(socket);
    }

    static removeDashboardClient(socket: WebSocket) {
        this.dashboardClients.delete(socket);
    }

    static getClientSocket(clientId: string): WebSocket | undefined {
        return this.connectedClients.get(clientId);
    }

    static getClientsWithStatus() {
        const clients = ClientRepository.findAll();
        return clients.map((client) => ({
            id: client.id,
            hostname: client.hostname,
            displayName: client.display_name,
            status: this.connectedClients.has(client.id) ? "online" : "offline",
            lastSeen: client.last_seen,
            ipAddress: client.ip_address,
            version: client.version,
            publicKey: client.publickey,
            createdAt: client.created_at,
            updatedAt: client.updated_at,
        }));
    }

    static updateClient(id: string, data: { displayName?: string }) {
        if (data.displayName !== undefined) {
            const info = ClientRepository.updateDisplayName(
                id,
                data.displayName,
            );
            if (info.changes > 0) {
                this.broadcastClientUpdate();
                return true;
            }
        }
        return false;
    }

    /**
     * Broadcasts the complete list of registered clients and their online status
     * to all active dashboard WebSocket sessions.
     */
    static broadcastClientUpdate() {
        try {
            const clients = this.getClientsWithStatus();
            const message = JSON.stringify({
                type: "CLIENTS_UPDATE",
                payload: clients,
            });
            this.broadcastToDashboard(JSON.parse(message));
        } catch (e) {
            logger.error({ err: e }, "Broadcast error");
        }
    }

    static broadcastToDashboard(message: any) {
        const msgStr =
            typeof message === "string" ? message : JSON.stringify(message);
        // Multicast message to all connected dashboard sessions
        for (const client of this.dashboardClients) {
            if (client.readyState === client.OPEN) {
                client.send(msgStr);
            }
        }
    }

    /**
     * Sends an asynchronous, typed request to a specific client agent via WebSocket.
     * Automatically generates a unique requestId and waits for the correlating response.
     * Times out if the client does not respond within 5 seconds.
     *
     * @param clientId - The target agent's UUID
     * @param type - The exact event type from WS_EVENTS
     * @param payload - The payload matching the specific event protocol
     */
    static async sendRequest<K extends keyof ProtocolMap>(
        clientId: string,
        type: K,
        payload: ProtocolMap[K]["req"],
    ): Promise<ProtocolMap[K]["res"]> {
        const socket = this.connectedClients.get(clientId);
        if (!socket) {
            throw new Error("Client not connected");
        }

        // Generate a unique Request ID to correlate the async response from the client.
        const requestId = (payload as any).requestId || randomUUID();
        // Ensure payload has requestId
        const finalPayload = { ...payload, requestId };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("Timeout")),
                5000,
            );

            const listener = (msg: Buffer) => {
                try {
                    const data = JSON.parse(msg.toString()) as WsMessage<any>;

                    // Check if message matches the expected type and requestId
                    if (
                        data.type === type &&
                        data.payload.requestId === requestId
                    ) {
                        clearTimeout(timeout);
                        socket.off("message", listener);
                        if (data.payload.error) {
                            reject(new Error(data.payload.error));
                        } else {
                            resolve(data.payload as ProtocolMap[K]["res"]);
                        }
                    }
                } catch (e) {}
            };
            socket.on("message", listener);
            socket.send(JSON.stringify({ type, payload: finalPayload }));
        });
    }

    /**
     * Sends a one-way message to a client agent without waiting for a response.
     * Primarily used for 'fire-and-forget' manual triggers (e.g. starting a backup).
     */
    static sendFireAndForget(clientId: string, type: string, payload: any) {
        const socket = this.connectedClients.get(clientId);
        if (!socket) throw new Error("Client not connected");
        socket.send(JSON.stringify({ type, payload }));
    }
}
