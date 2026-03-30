import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as client from "openid-client";
import YAML from "yaml";
import { logger } from "../core/logger.js";

import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../../../config.yaml");

export interface AppConfig {
    jwtSecret: string;
    jwtExpiresIn?: string;
    logLevel?: string;
    oidc?: {
        enabled?: boolean;
        issuer: string;
        client_id: string;
        client_secret: string;
        redirect_uri: string;
    };
    settings: {
        retention_invalid_tokens_days: string;
        retention_invalid_tokens_count: string;
        [key: string]: string;
    };
    security?: {
        allowed_networks?: string[];
        trusted_networks?: string[];
    };
    [key: string]: any;
}

const DEFAULT_SETTINGS = {
    retention_invalid_tokens_days: "30",
    retention_invalid_tokens_count: "10",
};

let configDoc: YAML.Document = new YAML.Document({});
let config: Partial<AppConfig> = {};

function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
            configDoc = YAML.parseDocument(fileContent);
            config = configDoc.toJS() as Partial<AppConfig>;
        } catch (e) {
            logger.error({ err: e }, "Failed to load config.yaml");
        }
    }

    // Ensure settings object exists
    if (!config.settings) {
        config.settings = { ...DEFAULT_SETTINGS };
    } else {
        // Merge with defaults for missing keys
        config.settings = { ...DEFAULT_SETTINGS, ...config.settings };
    }

    // Ensure security object exists
    if (!config.security) {
        config.security = {
            allowed_networks: [],
            trusted_networks: [],
        };
    } else {
        if (!config.security.allowed_networks)
            config.security.allowed_networks = [];
        if (!config.security.trusted_networks)
            config.security.trusted_networks = [];
    }

    // Synchronize document with the potentially merged settings
    syncDoc();
}

/**
 * Synchronizes the YAML document with the current config object
 * while preserving structure and comments.
 */
function syncDoc() {
    if (!configDoc.contents) {
        configDoc.contents = configDoc.createNode({});
    }

    const updateRecursive = (path: string[], value: any) => {
        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            for (const [key, val] of Object.entries(value)) {
                updateRecursive([...path, key], val);
            }
        } else {
            configDoc.setIn(path, value);
        }
    };

    // Explicitly handle root-level scalar values like jwtSecret
    for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
            updateRecursive([key], value);
        }
    }
}

loadConfig();

// Apply logLevel from config if no env override is set
if (!process.env.LOG_LEVEL && config.logLevel) {
    logger.level = config.logLevel;
}

export function saveConfig() {
    try {
        syncDoc();
        const yamlOutput = configDoc.toString();
        fs.writeFileSync(CONFIG_PATH, yamlOutput);
    } catch (e) {
        logger.error(
            { err: e, path: CONFIG_PATH },
            "Failed to save config.yaml",
        );
        throw e;
    }
}

if (!config.jwtSecret) {
    logger.info("No JWT secret found in config.yaml, generating a new one...");
    config.jwtSecret = crypto.randomBytes(64).toString("hex");
    try {
        saveConfig();
        logger.info("Generated new JWT secret and saved to config.yaml");
    } catch (e) {
        logger.error(
            { err: e },
            "Failed to save generated JWT secret to config.yaml",
        );
    }
}

export const appConfig = config as AppConfig;

export function updateConfig(updates: Partial<AppConfig>) {
    Object.assign(config, updates);
    saveConfig();
}

let oidcConfig: client.Configuration | null = null;

export async function initOIDC() {
    if (appConfig.oidc && appConfig.oidc.enabled) {
        try {
            oidcConfig = await client.discovery(
                new URL(appConfig.oidc.issuer),
                appConfig.oidc.client_id,
                appConfig.oidc.client_secret,
            );
            logger.info("OIDC Client initialized");
        } catch (e) {
            logger.error({ err: e }, "Failed to initialize OIDC client");
        }
    }
}

export function getOidcConfig() {
    return oidcConfig;
}
