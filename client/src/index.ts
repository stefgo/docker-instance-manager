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
        startWebServer();
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
}
