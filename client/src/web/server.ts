import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { config, saveConfig, setServerUrl } from "../core/Config.js";
import { Connection } from "../core/Connection.js";
import { logger } from "../core/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let fastifyInstance: any = null;

export async function startWebServer() {
    fastifyInstance = Fastify({ logger: false });
    const fastify = fastifyInstance;

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

    // Redirect / based on auth token status
    fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
        if (config.authToken && config.authToken.trim().length > 0) {
            return reply.redirect("/status");
        } else {
            return reply.redirect("/register");
        }
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
    fastify.get(
        "/status",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return sendFileSafe(reply, "status.html");
        },
    );

    // Serve registration page
    fastify.get(
        "/register",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return sendFileSafe(reply, "register.html");
        },
    );

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

    // API to perform registration
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
                    config.authToken = data.token;
                    setServerUrl(url);
                    saveConfig();
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
