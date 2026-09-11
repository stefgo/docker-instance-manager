import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { logger } from "@dim/shared/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

// Paths
export const CONFIG_PATH = path.resolve(ROOT_DIR, "config.yaml");

export interface ClientConfig {
    serverUrl?: string;
    websocketURL?: string;
    /**
     * The id the server issued during registration. Absent until then: the agent never picks
     * one itself, because an id chosen by the caller is what let a registration take over an
     * existing client.
     */
    clientId?: string;
    authToken?: string;
    registrationSecret?: string;
    logLevel: string;
    dockerSocket?: string;
    enableStatusPage?: boolean;
    enableRegisterPage?: boolean;
}

// Global Document state to preserve comments
let configDoc: YAML.Document = new YAML.Document({});

// Default Config
export const config: ClientConfig = {
    logLevel: process.env.LOG_LEVEL || "info",
    enableStatusPage: true,
    enableRegisterPage: true,
};

function writeToDisk(): void {
    try {
        fs.writeFileSync(CONFIG_PATH, configDoc.toString());
    } catch (e) {
        logger.error({ err: e }, "Failed to save config.yaml");
    }
}

function applyServerUrl(url: string): void {
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

/**
 * Stores the identity the server issued during registration.
 *
 * clientId is optional only for the outbound handshake with a server that predates issuing
 * it; such a server sends the auth token alone, and the agent keeps whatever id it had.
 */
export function persistIdentity(authToken: string, clientId?: string): void {
    config.authToken = authToken;
    configDoc.set("authToken", authToken);
    if (clientId) {
        config.clientId = clientId;
        configDoc.set("clientId", clientId);
    }
    writeToDisk();
}

export function persistServerUrl(url: string): void {
    applyServerUrl(url);
    configDoc.set("serverUrl", config.serverUrl);
    writeToDisk();
}

export function deleteRegistrationSecret(): void {
    delete config.registrationSecret;
    if (configDoc.has("registrationSecret")) {
        // Set to empty plain scalar (renders as "registrationSecret:" with no value)
        // to preserve the key and its comments rather than deleting them.
        const emptyScalar = new YAML.Scalar(null);
        emptyScalar.type = "PLAIN";
        emptyScalar.source = "";
        configDoc.set("registrationSecret", emptyScalar);
    }
    writeToDisk();
}

// Load Config
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
        configDoc = YAML.parseDocument(fileContent);
        const loadedConfig = configDoc.toJS() as any;

        // No id is generated when the file has none: it is issued by the server on
        // registration (see persistIdentity).
        if (typeof loadedConfig.clientId === "string" && loadedConfig.clientId) {
            config.clientId = loadedConfig.clientId;
        }

        if (loadedConfig.authToken) {
            config.authToken = loadedConfig.authToken;
        }

        if (loadedConfig.registrationSecret) {
            config.registrationSecret = loadedConfig.registrationSecret;
        }

        if (loadedConfig.serverUrl) {
            applyServerUrl(loadedConfig.serverUrl);
            logger.info("Using Server URL from config: " + config.serverUrl);
        }

        if (loadedConfig.logLevel) {
            config.logLevel = loadedConfig.logLevel;
        }

        if (loadedConfig.dockerSocket) {
            config.dockerSocket = loadedConfig.dockerSocket;
        }

        if (loadedConfig.enableStatusPage !== undefined) {
            config.enableStatusPage = loadedConfig.enableStatusPage;
        }

        if (loadedConfig.enableRegisterPage !== undefined) {
            config.enableRegisterPage = loadedConfig.enableRegisterPage;
        }
    } catch (e) {
        logger.error({ err: e }, "Failed to load config.yaml");
    }
} else {
    // If config file doesn't exist, use defaults
    logger.info("No config.yaml found. Using defaults.");
}

logger.level = config.logLevel;
