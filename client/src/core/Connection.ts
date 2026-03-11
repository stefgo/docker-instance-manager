import WebSocket from "ws";

import os from "os";
import { config } from "./Config.js";
import {
    WS_EVENTS,
    WsMessage,
    ProtocolMap,
} from "@docker-instance-manager/shared";

import { logger } from "./logger.js";
import { VERSION } from "./Version.js";

export class Connection {
    private static wsInstance: WebSocket | null = null;

    /**
     * Checks if the WebSocket connection to the server is currently open.
     */
    static isConnected(): boolean {
        return (
            this.wsInstance !== null &&
            this.wsInstance.readyState === WebSocket.OPEN
        );
    }

    /**
     * Sends a typed message payload to the server over the WebSocket connection.
     *
     * @param type - The event type from WS_EVENTS.
     * @param payload - The data payload matching the protocol map for the event.
     */
    static send<T extends keyof ProtocolMap>(
        type: T,
        payload: ProtocolMap[T]["req"],
    ): void {
        if (this.wsInstance && this.wsInstance.readyState === WebSocket.OPEN) {
            this.wsInstance.send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Establishes a WebSocket connection to the central backend server using the
     * configured URL and authentication token. Implements automatic reconnection,
     * handles incoming messages and routes them to the appropriate Handlers.
     *
     * @returns A promise resolving to an object indicating connection success or failure.
     */
    static connect(): Promise<{ connected: boolean; error?: string }> {
        if (this.isConnected()) {
            return Promise.resolve({ connected: true });
        }

        if (!config.websocketURL) {
            logger.warn("No Websocket URL configured. Connection skipped.");
            return Promise.resolve({
                connected: false,
                error: "No Websocket URL configured.",
            });
        }

        if (!config.authToken) {
            logger.warn("No Token. Please register first. Connection skipped.");
            return Promise.resolve({
                connected: false,
                error: "No Token. Register first.",
            });
        }

        // Close any stale instance before retrying
        if (this.wsInstance) {
            try {
                this.wsInstance.close();
            } catch (_) {}
            this.wsInstance = null;
        }

        const wsUrl = new URL(config.websocketURL);
        wsUrl.searchParams.set("token", config.authToken);

        logger.info(`Connecting to ${wsUrl.toString()}...`);

        const ws = new WebSocket(wsUrl.toString());
        this.wsInstance = ws;

        return new Promise((resolve) => {
            let pingTimeout: NodeJS.Timeout;

            function heartbeat() {
                clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    logger.warn(
                        "WebSocket heartbeat timeout. Terminating connection.",
                    );
                    ws.terminate();
                }, 35000); // 30s server interval + 5s buffer
            }

            const timeout = setTimeout(() => {
                resolve({
                    connected: false,
                    error: "Connection timeout (5s).",
                });
            }, 5000);

            ws.on("open", () => {
                heartbeat();
                logger.info("Connected to server");
                Connection.send(WS_EVENTS.AUTH, {
                    hostname: os.hostname(),
                    version: VERSION,
                });
            });

            ws.on("ping", heartbeat);

            ws.on("message", (data: WebSocket.RawData) => {
                heartbeat();
                try {
                    const message = JSON.parse(data.toString()) as WsMessage;

                    // Route messages to appropriate handlers based on event type
                    switch (message.type) {
                        case WS_EVENTS.AUTH_SUCCESS:
                            clearTimeout(timeout);
                            logger.info("Authenticated successfully");
                            resolve({ connected: true });
                            break;
                    }
                } catch (err) {
                    logger.error({ err: err }, "Failed to parse message");
                }
            });

            ws.on("close", (code: number, reason: Buffer) => {
                clearTimeout(pingTimeout);
                clearTimeout(timeout);
                this.wsInstance = null;
                const reasonStr = reason.toString() || "No reason provided";
                logger.warn(
                    `Disconnected (Code: ${code}, Reason: ${reasonStr}). Reconnecting in 5s...`,
                );
                resolve({
                    connected: false,
                    error: `${reasonStr} (Code: ${code})`,
                });
                setTimeout(() => Connection.connect(), 5000);
            });

            ws.on("error", (err: Error) => {
                logger.error("Connection error: " + err.message);
                ws.close();
            });
        });
    }
}
