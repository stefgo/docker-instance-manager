import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import jwt from "@fastify/jwt";
import path from "path";
import { fileURLToPath } from "url";

import { initOIDC, appConfig } from "./config/AppConfig.js";
import { AuthService } from "./services/AuthService.js";
import { ImageUpdateCacheCleanupService } from "./services/ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "./services/ImageUpdateCheckSchedulerService.js";
import apiRoutes from "./routes/api.js";
import { WebSocketController } from "./controllers/WebSocketController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { initDatabase } from "./core/Database.js";

// Initialize Database & Services
await initDatabase();
await initOIDC();
await AuthService.initializeAdmin(); // Ensure admin user
ImageUpdateCacheCleanupService.startScheduler();
ImageUpdateCheckSchedulerService.startScheduler();

import { loggerOptions } from "./core/logger.js";

const server = Fastify({
    // Trust Proxy is required for correct IP detection behind Traefik
    trustProxy: true,
    disableRequestLogging: true,
    logger: loggerOptions,
});

// Custom Logging Hooks
server.addHook("onRequest", async (req) => {
    req.log.debug({ req: req }, "incoming request");
});

server.addHook("onResponse", async (req, reply) => {
    if (reply.statusCode >= 500) {
        req.log.error(
            { res: reply, responseTime: reply.elapsedTime },
            "request errored",
        );
    } else if (reply.statusCode >= 400) {
        req.log.warn(
            { res: reply, responseTime: reply.elapsedTime },
            "request failed",
        );
    } else {
        req.log.debug(
            { res: reply, responseTime: reply.elapsedTime },
            "request completed",
        );
    }
});

// Plugins
await server.register(cors);
await server.register(jwt, {
    secret: appConfig.jwtSecret,
    sign: appConfig.jwtExpiresIn
        ? { algorithm: "HS256", expiresIn: appConfig.jwtExpiresIn }
        : { algorithm: "HS256" },
});

await server.register(staticFiles, {
    root: path.join(__dirname, "../../dist/public"),
    prefix: "/",
});

await server.register(websocket);

// API Routes
server.register(apiRoutes, { prefix: "/api" });

// WebSocket Routes
server.register(async function (fastify) {
    fastify.get("/ws/dashboard", { websocket: true }, (con, req) =>
        WebSocketController.handleDashboardConnection(con, req, fastify),
    );
    fastify.get("/ws/agent", { websocket: true }, (con, req) =>
        WebSocketController.handleAgentConnection(con, req, fastify),
    );
});

// Catch-all for SPA
server.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url && request.raw.url.startsWith("/api")) {
        return reply.code(404).send({ error: "Endpoint not found" });
    }
    return reply.sendFile("index.html");
});

// Start
try {
    await server.listen({
        port: 3000,
        host: "0.0.0.0",
    });
} catch (err) {
    server.log.error(err);
    process.exit(1);
}

const shutdown = () => {
    server.log.info("Shutting down server...");
    ImageUpdateCacheCleanupService.stopScheduler();
    ImageUpdateCheckSchedulerService.stopScheduler();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
