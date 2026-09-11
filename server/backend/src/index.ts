import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import jwt from "@fastify/jwt";
import path from "path";
import { fileURLToPath } from "url";

import {
    initOIDC,
    appConfig,
    DEFAULT_JWT_EXPIRES_IN,
} from "./config/AppConfig.js";
import { AuthService } from "./services/AuthService.js";
import { ImageUpdateCacheCleanupService } from "./services/ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "./services/ImageUpdateCheckSchedulerService.js";
import { ContainerAutoUpdateSchedulerService } from "./services/ContainerAutoUpdateSchedulerService.js";
import { NotificationCleanupService } from "./services/NotificationCleanupService.js";
import apiRoutes from "./routes/api.js";
import { WebSocketController } from "./controllers/WebSocketController.js";
import { ClientConnector } from "./services/ClientConnector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { initDatabase } from "./core/Database.js";

// Initialize Database & Services
await initDatabase();
await initOIDC();
await AuthService.initializeAdmin(); // Ensure admin user
ImageUpdateCacheCleanupService.startScheduler();
ImageUpdateCheckSchedulerService.startScheduler();
ContainerAutoUpdateSchedulerService.startScheduler();
NotificationCleanupService.startScheduler();

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
// origin: false sends no CORS headers at all, because nothing here is ever a
// cross-origin request: in production this server serves the SPA itself from
// dist/public, and in development Vite proxies /api and /ws to this port, so the
// browser talks to its own origin either way. Registered without options it
// reflected whatever Origin a caller sent.
await server.register(cors, { origin: false });

// Registered without a global limit: the only route that needs one is the login, and a
// blanket limit would also count the dashboard's own polling and the agent handshakes,
// where a larger fleet legitimately produces bursts. Routes opt in via `config.rateLimit`.
// Clients are told apart by request.ip, which honours X-Forwarded-For because of
// trustProxy above -- see doc/install.md on running without a reverse proxy.
await server.register(rateLimit, { global: false });

// Every token carries an expiry now; the branch that signed tokens without one is gone.
// maxAge on verify also retires the tokens issued before that change: they have no exp
// claim, but they do have iat, so they expire by age instead of staying valid forever.
const jwtExpiresIn = appConfig.jwtExpiresIn || DEFAULT_JWT_EXPIRES_IN;
await server.register(jwt, {
    secret: appConfig.jwtSecret,
    sign: { algorithm: "HS256", expiresIn: jwtExpiresIn },
    verify: { maxAge: jwtExpiresIn },
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
    await ClientConnector.connectAll();
} catch (err) {
    server.log.error(err);
    process.exit(1);
}

const shutdown = () => {
    server.log.info("Shutting down server...");
    ImageUpdateCacheCleanupService.stopScheduler();
    ImageUpdateCheckSchedulerService.stopScheduler();
    ContainerAutoUpdateSchedulerService.stopScheduler();
    NotificationCleanupService.stopScheduler();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
