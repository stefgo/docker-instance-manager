import { Connection } from "./core/Connection.js";
import { startWebServer, stopWebServer, isWebServerNeeded } from "./web/server.js";
import { logger } from "./core/logger.js";
import { executeHelperMode } from "./services/SelfUpdateService.js";
import { DockerService } from "./services/DockerService.js";

if (process.env.DIM_HELPER_MODE === "true") {
    logger.info("Starting in HELPER MODE for self-update...");
    executeHelperMode();
} else {
    await DockerService.assertMinApiVersion();

    if (isWebServerNeeded()) {
        // Awaited so the process handlers below are only in place once startup is
        // done. startWebServer() already catches and logs a failed listen(); without
        // the await, a failing plugin registration would end up in the
        // unhandledRejection handler instead of aborting the start.
        await startWebServer();
    } else {
        logger.info("Web server disabled: status page, register page and inbound mode are all inactive.");
    }

    // Try to connect to server
    Connection.connect();

    // Handle graceful shutdown
    const shutdown = async () => {
        logger.info("Received shutdown signal, terminating client...");
        await stopWebServer();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Registered only after startup, so a failed start (Docker API version, web
    // server plugins) still fails fast instead of being swallowed here. Helper mode
    // is left out: it is a short-lived one-shot that ends with its own exit code.

    // The agent has to survive a stray rejection: it holds the connection the server
    // manages this host through, and nobody is watching it interactively.
    process.on("unhandledRejection", (reason) => {
        logger.error({ err: reason }, "Unhandled promise rejection");
    });

    // An uncaught exception leaves the process in an unknown state. Log it and exit so
    // the supervisor restarts us (compose.yaml: restart: unless-stopped).
    process.on("uncaughtException", (err) => {
        logger.fatal({ err }, "Uncaught exception, terminating");
        // Give the pino transport worker a moment to flush before we go.
        setTimeout(() => process.exit(1), 250);
    });
}
