import { Connection } from "./core/Connection.js";
import { startWebServer, stopWebServer } from "./web/server.js";
import { logger } from "./core/logger.js";

// Start Client Web Server (can be disabled via DISABLE_WEB_UI=true)
if (process.env.DISABLE_WEB_UI !== "true") {
    startWebServer();
} else {
    logger.info("Web UI disabled via DISABLE_WEB_UI environment variable.");
}

// Try to connect to server
Connection.connect();

// Start Docker event watcher (sends updates via WebSocket on any change)
Connection.startDockerWatch();

// Handle graceful shutdown
const shutdown = async () => {
    logger.info("Received shutdown signal, terminating client...");
    await stopWebServer();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
