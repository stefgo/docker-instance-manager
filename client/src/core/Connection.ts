import WebSocket from "ws";

import os from "os";
import { config } from "./Config.js";
import {
    WS_EVENTS,
    WsMessage,
    ProtocolMap,
    DockerActionSchema,
    firstIssue,
} from "@dim/shared";

import { logger } from "@dim/shared/node";
import { VERSION } from "./Version.js";
import { isCertificateError } from "./ServerHttp.js";
import { DockerService } from "../services/DockerService.js";

export class Connection {
    private static wsInstance: WebSocket | null = null;
    private static dockerWatchStarted = false;

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
     * Sends a typed message on a given socket. The action result has to go back over the
     * socket the action arrived on, which is not necessarily wsInstance by the time the
     * action has finished.
     */
    private static sendOn<T extends keyof ProtocolMap>(
        ws: WebSocket,
        type: T,
        payload: ProtocolMap[T]["req"],
    ): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Fetches the current Docker state and sends it to the server.
     */
    static async sendDockerState(): Promise<void> {
        try {
            const state = await DockerService.getState();
            Connection.send(WS_EVENTS.DOCKER_UPDATE, state);
        } catch (err) {
            logger.warn({ err }, "Failed to send Docker state");
        }
    }

    /**
     * Starts the Docker event watcher so any change triggers a state push.
     */
    static startDockerWatch(): void {
        DockerService.watch((state) => {
            Connection.send(WS_EVENTS.DOCKER_UPDATE, state);
        });
    }

    /**
     * Runs a DOCKER_ACTION from the server once it has been checked.
     *
     * The server validates the action it sends, but this is the side that owns the Docker
     * socket, so it does not rely on that: a server of another build, or a malformed
     * message, must not reach Dockerode. A rejected action that still carries an actionId
     * is answered with a failure at once -- the server is waiting for it, and silence would
     * cost it the full action timeout. Without an actionId nobody can be told.
     */
    private static handleDockerAction(ws: WebSocket, payload: unknown): void {
        const parsed = DockerActionSchema.safeParse(payload);
        if (!parsed.success) {
            const actionId = (payload as { actionId?: unknown } | null)?.actionId;
            logger.warn(
                { actionId, issues: parsed.error.issues },
                "Rejecting malformed DOCKER_ACTION from server",
            );
            if (typeof actionId === "string" && actionId) {
                Connection.sendOn(ws, WS_EVENTS.DOCKER_ACTION_RESULT, {
                    actionId,
                    success: false,
                    error: `Invalid action: ${firstIssue(parsed.error)}`,
                });
            }
            return;
        }

        DockerService.executeAction(parsed.data).then((result) => {
            Connection.sendOn(ws, WS_EVENTS.DOCKER_ACTION_RESULT, result);
            Connection.sendDockerState();
        });
    }

    /**
     * Shared setup for an established WebSocket connection (inbound or outbound).
     * Attaches heartbeat, message routing, and close handler to the socket.
     * The caller is responsible for the AUTH handshake before calling this.
     */
    static setupConnection(ws: WebSocket, onClose?: () => void): void {
        this.wsInstance = ws;

        let pingTimeout: NodeJS.Timeout;

        function heartbeat() {
            clearTimeout(pingTimeout);
            pingTimeout = setTimeout(() => {
                logger.warn("WebSocket heartbeat timeout. Terminating connection.");
                ws.terminate();
            }, 35000);
        }

        heartbeat();
        ws.on("ping", heartbeat);

        ws.on("message", (data: WebSocket.RawData) => {
            heartbeat();
            try {
                const message = JSON.parse(data.toString()) as WsMessage;

                switch (message.type) {
                    case WS_EVENTS.DOCKER_ACTION:
                        Connection.handleDockerAction(ws, message.payload);
                        break;

                    case WS_EVENTS.REQUEST_STATE_UPDATE:
                        Connection.sendDockerState();
                        break;
                }
            } catch (err) {
                logger.error({ err }, "Failed to parse message");
            }
        });

        ws.on("close", (code: number, reason: Buffer) => {
            clearTimeout(pingTimeout);
            this.wsInstance = null;
            const reasonStr = reason.toString() || "No reason provided";
            logger.warn(`Disconnected (Code: ${code}, Reason: ${reasonStr}).`);
            onClose?.();
        });

        ws.on("error", (err: Error) => {
            logger.error("Connection error: " + err.message);
            ws.close();
        });

        // Send initial Docker state and start watcher
        Connection.sendDockerState();
        if (!Connection.dockerWatchStarted) {
            Connection.dockerWatchStarted = true;
            Connection.startDockerWatch();
        }
    }

    /**
     * Handles an inbound WebSocket connection initiated by the server.
     * The server already authenticated the client via token check in the HTTP upgrade.
     * The client sends AUTH to complete the handshake, then calls setupConnection().
     */
    static handleIncoming(ws: WebSocket): void {
        if (this.wsInstance) {
            try { this.wsInstance.close(4000, "Replaced by new connection"); } catch (_) {}
            this.wsInstance = null;
        }

        logger.info("Inbound server connection received, sending AUTH...");

        ws.send(JSON.stringify({
            type: WS_EVENTS.AUTH,
            payload: { hostname: os.hostname(), version: VERSION },
        }));

        const authTimeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close(4001, "Authentication timed out");
            }
        }, 5000);

        ws.once("message", (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString()) as WsMessage;
                if (message.type === WS_EVENTS.AUTH_SUCCESS) {
                    clearTimeout(authTimeout);
                    logger.info("Authenticated successfully (inbound)");
                    Connection.setupConnection(ws, () => {
                        // No auto-reconnect for inbound — server handles reconnect
                    });
                } else {
                    clearTimeout(authTimeout);
                    logger.warn(`Unexpected message during inbound auth: ${message.type}`);
                    ws.close(4003, "Unexpected auth response");
                }
            } catch (err) {
                clearTimeout(authTimeout);
                logger.error({ err }, "Failed to parse inbound auth response");
                ws.close(4000, "Protocol error");
            }
        });
    }

    /**
     * Establishes a WebSocket connection to the central backend server (outbound).
     * Implements automatic reconnection on disconnect.
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
            try { this.wsInstance.close(); } catch (_) {}
            this.wsInstance = null;
        }

        const wsUrl = new URL(config.websocketURL);
        wsUrl.searchParams.set("token", config.authToken);

        logger.info(`Connecting to ${wsUrl.toString()}...`);

        // Explicit rather than inherited from the process: the certificate check used to
        // depend on whether the web UI had set NODE_TLS_REJECT_UNAUTHORIZED earlier.
        const ws = new WebSocket(wsUrl.toString(), {
            rejectUnauthorized: !config.allowSelfSignedCertificates,
        });
        this.wsInstance = ws;

        return new Promise((resolve) => {
            let pingTimeout: NodeJS.Timeout;

            function heartbeat() {
                clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    logger.warn("WebSocket heartbeat timeout. Terminating connection.");
                    ws.terminate();
                }, 35000);
            }

            const timeout = setTimeout(() => {
                resolve({ connected: false, error: "Connection timeout (5s)." });
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

                    switch (message.type) {
                        case WS_EVENTS.AUTH_SUCCESS:
                            clearTimeout(timeout);
                            logger.info("Authenticated successfully");
                            resolve({ connected: true });
                            Connection.sendDockerState();
                            if (!Connection.dockerWatchStarted) {
                                Connection.dockerWatchStarted = true;
                                Connection.startDockerWatch();
                            }
                            break;

                        case WS_EVENTS.DOCKER_ACTION:
                            Connection.handleDockerAction(ws, message.payload);
                            break;

                        case WS_EVENTS.REQUEST_STATE_UPDATE:
                            Connection.sendDockerState();
                            break;
                    }
                } catch (err) {
                    logger.error({ err }, "Failed to parse message");
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
                resolve({ connected: false, error: `${reasonStr} (Code: ${code})` });
                setTimeout(() => Connection.connect(), 5000);
            });

            ws.on("error", (err: Error) => {
                logger.error("Connection error: " + err.message);
                if (isCertificateError(err)) {
                    logger.error(
                        "The server's certificate could not be verified. If it is self-signed on purpose, set allowSelfSignedCertificates: true in config.yaml.",
                    );
                }
                ws.close();
            });
        });
    }
}
