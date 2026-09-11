import { z } from "zod";
import { CLIENT_STATUS, CONNECTION_MODE, DOCKER_ACTION_TYPES } from "./constants.js";
import {
    ClientSchema,
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    TokenSchema,
    AuthPayloadSchema,
    LoginPayloadSchema,
    CreateUserSchema,
    UpdateUserSchema,
    CreateOutboundClientSchema,
    UpdateClientSchema,
    DockerActionRequestSchema,
    CleanupSettingsSchema,
} from "./schemas.js";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

/**
 * Derived from the constants, so the value is written down in exactly one place and the
 * Zod enums in schemas.ts are built from the same objects.
 */
export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];
export type ConnectionMode = (typeof CONNECTION_MODE)[keyof typeof CONNECTION_MODE];

export type Client = z.infer<typeof ClientSchema>;
export type Token = z.infer<typeof TokenSchema>;

// REST request bodies
export type LoginPayload = z.infer<typeof LoginPayloadSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type CreateOutboundClient = z.infer<typeof CreateOutboundClientSchema>;
export type UpdateClient = z.infer<typeof UpdateClientSchema>;
export type DockerActionRequest = z.infer<typeof DockerActionRequestSchema>;
export type CleanupSettings = z.infer<typeof CleanupSettingsSchema>;

// WS Payloads
export type AuthPayload = z.infer<typeof AuthPayloadSchema>;

export interface WsMessage<T = any> {
    type: string;
    payload: T;
}

export interface ProtocolMap {
    AUTH: {
        req: AuthPayload;
        res: void;
    };
    AUTH_SUCCESS: {
        req: void;
        res: { lastSyncTime?: string | null };
    };
    AUTH_FAILURE: {
        req: { error?: string };
        res: void;
    };
}

// ── Docker Types ────────────────────────────────────────────────────────────

export interface DockerPort {
    ip?: string;
    privatePort: number;
    publicPort?: number;
    type: string;
}

export interface DockerContainer {
    id: string;
    names: string[];
    image: string;
    imageId: string;
    command: string;
    created: number;
    state: string;   // running | exited | paused | restarting | dead | created
    status: string;  // human-readable e.g. "Up 2 hours"
    health?: "healthy" | "unhealthy" | "starting" | "none";
    ports: DockerPort[];
    labels: Record<string, string>;
    configImage?: string;
}

export interface DockerImageUpdateCheck {
    hasUpdate: boolean;
    remoteDigest: string | null;
    checkedAt: string;
    error?: string;
}

export interface DockerImage {
    id: string;
    parentId: string;
    repoTags: string[];
    repoDigests: string[];
    created: number;
    size: number;
    labels: Record<string, string> | null;
    updateCheck?: DockerImageUpdateCheck;
}

export interface DockerVolume {
    name: string;
    driver: string;
    mountpoint: string;
    createdAt: string;
    labels: Record<string, string> | null;
    scope: string;
}

export interface DockerNetwork {
    id: string;
    name: string;
    driver: string;
    scope: string;
    ipam: {
        driver: string;
        config: Array<{ subnet?: string; gateway?: string }>;
    };
    internal: boolean;
    attachable: boolean;
    labels: Record<string, string> | null;
    created: string;
}

export interface DockerState {
    containers: DockerContainer[];
    images: DockerImage[];
    volumes: DockerVolume[];
    networks: DockerNetwork[];
    updatedAt: string;
}

export interface ImageUpdateCheckResult {
    repoTag: string;
    localDigest: string | null;
    remoteDigest: string | null;
    hasUpdate: boolean;
    error?: string;
}

export type DockerActionType = (typeof DOCKER_ACTION_TYPES)[number];

export interface DockerAction {
    actionId: string;
    action: DockerActionType;
    target: string;
    params?: Record<string, any>;
}

export interface DockerActionResult {
    actionId: string;
    success: boolean;
    error?: string;
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationLevel = "error" | "warning" | "info";

export interface NotificationContext {
    clientId?: string;
    clientName?: string;
    containerName?: string;
    containerId?: string;
    imageName?: string;
    [key: string]: string | undefined;
}

export interface Notification {
    id: string;
    level: NotificationLevel;
    message: string;
    detail?: string;
    context?: NotificationContext;
    createdAt: string;
    /**
     * Ids of the users who have seen the notification. Numbers: they come from the JWT,
     * which carries `users.id` as the INTEGER it is, and have always been stored as such.
     */
    seenBy: number[];
}
