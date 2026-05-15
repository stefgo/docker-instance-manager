import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { config, persistAuthToken, persistServerUrl, deleteRegistrationSecret } from "../core/Config.js";
import { Connection } from "../core/Connection.js";
import { logger } from "../core/logger.js";
import { WS_EVENTS } from "@dim/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let fastifyInstance: any = null;

/**
 * Returns true when the web server is needed:
 * - status or register page enabled, OR
 * - inbound mode is applicable (registrationSecret set, or authToken present without serverUrl)
 */
export function isWebServerNeeded(): boolean {
    if (config.enableStatusPage !== false) return true;
    if (config.enableRegisterPage !== false) return true;
    if (config.registrationSecret) return true;
    if (config.authToken && !config.serverUrl) return true;
    return false;
}

export async function startWebServer() {
    fastifyInstance = Fastify({ logger: false });
    const fastify = fastifyInstance;

    await fastify.register(fastifyWebSocket);

    // Serve static assets (CSS, etc.)
    // We check multiple locations to handle both dev (src) and prod (dist)
    const possiblePaths = [
        path.join(__dirname, "public"),
        path.join(__dirname, "../src/web/public"),
        path.join(process.cwd(), "src/web/public"),
        path.join(process.cwd(), "dist/web/public"),
    ];

    let publicPath = "";
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            publicPath = p;
            break;
        }
    }

    if (publicPath) {
        logger.info(`Serving static files from ${publicPath}`);
        await fastify.register(fastifyStatic, {
            root: publicPath,
            prefix: "/",
            serve: true,
        });
    } else {
        logger.error("Could not find public directory for Client Web UI!");
        logger.debug("Tried paths: " + possiblePaths.join(", "));
    }

    // Redirect / to the first available page
    fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
        const hasToken = !!config.authToken?.trim();
        if (config.enableStatusPage !== false && hasToken) return reply.redirect("/status");
        if (config.enableRegisterPage !== false) return reply.redirect("/register");
        if (config.enableStatusPage !== false) return reply.redirect("/status");
        return reply.code(404).send({ error: "No web UI available" });
    });

    const sendFileSafe = async (reply: FastifyReply, file: string) => {
        if (typeof (reply as any).sendFile === "function") {
            return (reply as any).sendFile(file);
        }

        logger.error(
            `reply.sendFile is not a function. Frontend files might be missing. Attempted to send: ${file}`,
        );
        return reply.status(500).send({
            error: "Internal Server Error",
            message:
                "Static file serving is not initialized. The 'public' directory might be missing in the distribution.",
            details: `Attempted to serve: ${file}`,
        });
    };

    // Serve status page
    if (config.enableStatusPage !== false) {
        fastify.get(
            "/status",
            async (_request: FastifyRequest, reply: FastifyReply) => {
                return sendFileSafe(reply, "status.html");
            },
        );
    }

    // Serve registration page
    if (config.enableRegisterPage !== false) {
        fastify.get(
            "/register",
            async (_request: FastifyRequest, reply: FastifyReply) => {
                return sendFileSafe(reply, "register.html");
            },
        );
    }

    // Check server reachability
    fastify.get(
        "/api/status/server",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const query = request.query as any;
            const checkUrl = query.url || config.serverUrl;
            let serverReachable = false;

            if (checkUrl) {
                try {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
                    const checkRes = await fetch(`${checkUrl}/api/v1/ping`, {
                        method: "GET",
                        signal: AbortSignal.timeout(2000),
                    });
                    if (checkRes.ok) {
                        serverReachable = true;
                    }
                } catch (e) {
                    // Server not reachable
                }
            }

            return {
                serverUrl: checkUrl || null,
                serverReachable,
            };
        },
    );

    // Check auth token existence
    fastify.get(
        "/api/status/auth",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                hasAuthToken:
                    !!config.authToken && config.authToken.trim().length > 0,
            };
        },
    );

    // Check current connection status
    fastify.get(
        "/api/status/connection",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                connected: Connection.isConnected(),
            };
        },
    );

    // Return config-derived mode info for the status page
    fastify.get(
        "/api/status/config",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                hasRegistrationSecret: !!config.registrationSecret,
                hasAuthToken: !!config.authToken && config.authToken.trim().length > 0,
                hasServerUrl: !!config.serverUrl && config.serverUrl.trim().length > 0,
            };
        },
    );

    // Attempt to establish connection
    fastify.post(
        "/api/connect",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const result = await Connection.connect();
            return {
                connected: result.connected,
                error: result.error,
            };
        },
    );

    // API to perform outbound registration
    fastify.post(
        "/api/register",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const body = request.body as any;
            const { token, url } = body;

            if (!token || !url) {
                return reply
                    .status(400)
                    .send({ error: "Missing token or url." });
            }

            logger.info(`Web UI Registration requested with ${url}...`);

            // Allow self-signed certificates
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

            try {
                const response = await fetch(`${url}/api/v1/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token,
                        clientId: config.clientId,
                        hostname: os.hostname(),
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMsg = errorText;
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error) errorMsg = errorJson.error;
                    } catch {
                        // Response is not JSON, use raw text
                    }
                    return reply.status(400).send({ error: errorMsg });
                }

                const data = await response.json();

                if (data.token) {
                    persistAuthToken(data.token);
                    persistServerUrl(url);
                    logger.info(
                        "Web Registration successful! Auth Token received.",
                    );

                    return {
                        success: true,
                        message: "Registration successful",
                    };
                } else {
                    return reply.status(500).send({
                        error: "Registration failed: No token received from server.",
                    });
                }
            } catch (e: unknown) {
                logger.error({ err: e }, "Web registration error:");
                return reply.status(500).send({
                    error:
                        (e instanceof Error ? e.message : String(e)) ||
                        "Unknown error occurred during registration",
                });
            }
        },
    );

    // Inbound: Server connects here to register the client.
    // Only active when no authToken exists yet and a registrationSecret is configured.
    fastify.get(
        "/ws/register",
        { websocket: true },
        (socket: any, req: FastifyRequest) => {
            if (config.authToken) {
                socket.close(4003, "Already registered");
                return;
            }

            if (!config.registrationSecret) {
                socket.close(4003, "No registration secret configured");
                return;
            }

            logger.info("Inbound registration connection received from server");

            const timeout = setTimeout(() => {
                if (socket.readyState === socket.OPEN) {
                    socket.close(4001, "Registration timed out");
                }
            }, 10000);

            socket.on("message", (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());

                    if (message.type === WS_EVENTS.REGISTRATION_REQUEST) {
                        const { secret, authToken } = message.payload;

                        if (secret !== config.registrationSecret) {
                            clearTimeout(timeout);
                            logger.warn("Registration rejected: secret mismatch");
                            socket.send(JSON.stringify({
                                type: WS_EVENTS.REGISTRATION_FAILURE,
                                payload: { error: "Secret mismatch" },
                            }));
                            socket.close(4003, "Invalid secret");
                            return;
                        }

                        persistAuthToken(authToken);
                        deleteRegistrationSecret();
                        clearTimeout(timeout);

                        logger.info("Registration successful, authToken stored");
                        socket.send(JSON.stringify({
                            type: WS_EVENTS.REGISTRATION_SUCCESS,
                            payload: { hostname: os.hostname() },
                        }));
                        socket.close(1000, "Registration complete");
                    }
                } catch (err) {
                    clearTimeout(timeout);
                    logger.error({ err }, "Error during registration handshake");
                    socket.close(4000, "Protocol error");
                }
            });

            socket.on("close", () => {
                clearTimeout(timeout);
            });
        },
    );

    // Inbound: Server connects here for the regular agent session.
    // Always active — server authenticates via token query param.
    fastify.get(
        "/ws/agent",
        { websocket: true },
        (socket: any, req: FastifyRequest) => {
            const query = req.query as any;
            const token = query.token;

            if (!token || !config.authToken || token !== config.authToken) {
                logger.warn("Inbound agent connection rejected: invalid token");
                socket.close(4001, "Unauthorized");
                return;
            }

            logger.info("Inbound agent connection accepted");
            Connection.handleIncoming(socket);
        },
    );

    try {
        const port = 3001;
        await fastify.listen({ port, host: "0.0.0.0" });
        logger.info(`Client Web UI listening on port ${port}`);
    } catch (err) {
        logger.error({ err: err }, "Failed to start Client Web UI server");
    }
}

export async function stopWebServer() {
    if (fastifyInstance) {
        logger.info("Shutting down Client Web UI...");
        try {
            await fastifyInstance.close();
            logger.info("Client Web UI shut down gracefully.");
        } catch (err) {
            logger.error({ err: err }, "Error shutting down Client Web UI");
        }
    }
}
