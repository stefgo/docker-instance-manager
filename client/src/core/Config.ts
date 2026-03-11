import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

// Paths
export const CONFIG_PATH = path.resolve(ROOT_DIR, "config.yaml");

export interface ClientConfig {
    serverUrl?: string;
    websocketURL?: string;
    clientId: string;
    authToken?: string;
    logLevel: string;
}

// Global Document state to preserve comments
let configDoc: YAML.Document = new YAML.Document({});

// Default Config
export const config: ClientConfig = {
    clientId: randomUUID(),
    logLevel: process.env.LOG_LEVEL || "info",
};

/**
 * Synchronizes the YAML document with the current config object
 * while preserving structure and comments.
 */
function syncDoc() {
    const configToSync = { ...config };
    delete configToSync.websocketURL; // Don't save dynamic prop

    for (const [key, value] of Object.entries(configToSync)) {
        configDoc.set(key, value);
    }
}

export function saveConfig(): void {
    try {
        syncDoc();
        fs.writeFileSync(CONFIG_PATH, configDoc.toString());
        logger.info("Configuration saved securely with preserved comments.");
    } catch (e) {
        logger.error({ err: e }, "Failed to save config.yaml");
    }
}

export function setServerUrl(url: string) {
    config.serverUrl = url;
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === "http:") {
            urlObj.protocol = "ws:";
        } else if (urlObj.protocol === "https:") {
            urlObj.protocol = "wss:";
        }

        if (!urlObj.pathname.endsWith("/ws/agent")) {
            urlObj.pathname = path.join(urlObj.pathname, "ws/agent");
        }
        config.websocketURL = urlObj.toString();
    } catch (e) {
        logger.error("Failed to parse server URL for websocket: " + url);
    }
}

// Load Config
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
        configDoc = YAML.parseDocument(fileContent);
        const loadedConfig = configDoc.toJS() as any;

        if (loadedConfig.clientId) {
            config.clientId = loadedConfig.clientId;
        } else {
            // Save generated ID if not present in file
            config.clientId = config.clientId; // Keep default
            saveConfig();
        }

        if (loadedConfig.authToken) {
            config.authToken = loadedConfig.authToken;
        }

        if (loadedConfig.serverUrl) {
            setServerUrl(loadedConfig.serverUrl);
            logger.info("Using Server URL from config: " + config.serverUrl);
        }

        if (loadedConfig.logLevel) {
            config.logLevel = loadedConfig.logLevel;
        }
    } catch (e) {
        logger.error({ err: e }, "Failed to load config.yaml");
    }
} else {
    // If config file doesn't exist, use defaults
    logger.info("No config.yaml found. Using defaults.");
}

logger.level = config.logLevel;
