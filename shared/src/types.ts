import { z } from "zod";
import {
    ClientSchema,
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    TokenSchema,
    AuthPayloadSchema,
} from "./schemas.js";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export type Client = z.infer<typeof ClientSchema>;
export type Token = z.infer<typeof TokenSchema>;

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
    ports: DockerPort[];
    labels: Record<string, string>;
}

export interface DockerImageUpdateCheck {
    hasUpdate: boolean;
    localDigest: string | null;
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
    image: string;
    localDigest: string | null;
    remoteDigest: string | null;
    hasUpdate: boolean;
    error?: string;
}

export type DockerActionType =
    | "container:start"
    | "container:stop"
    | "container:restart"
    | "container:remove"
    | "container:pause"
    | "container:unpause"
    | "container:recreate"
    | "image:remove"
    | "image:pull"
    | "image:update"
    | "image:prune"
    | "volume:remove"
    | "network:remove";

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
