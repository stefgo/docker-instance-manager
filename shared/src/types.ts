import { z } from "zod";
import {
    ACTIVITY_KINDS,
    ACTIVITY_LEVELS,
    ACTIVITY_SOURCES,
    CLIENT_STATUS,
    CONNECTION_MODE,
    DOCKER_ACTION_TYPES,
} from "./constants.js";
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
    DockerActionSchema,
    ProjectSchema,
    ActivityEventSchema,
    ActivitySubjectSchema,
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

/**
 * Payload types per event. `req` is what the sending side puts on the wire for that event;
 * for the agent's own messages that is the agent, which sends them through the typed
 * helpers in Connection instead of stringifying objects by hand.
 */
export interface ProtocolMap {
    AUTH: {
        req: AuthPayload;
        res: void;
    };
    DOCKER_UPDATE: {
        req: Omit<DockerState, "updatedAt">;
        res: void;
    };
    DOCKER_ACTION_RESULT: {
        req: DockerActionResult;
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
    ACTIVITY: {
        req: { events: ActivityEvent[] };
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

/** Derived from DockerActionSchema, which the agent checks every incoming action against. */
export type DockerAction = z.infer<typeof DockerActionSchema>;

export interface DockerActionResult {
    actionId: string;
    success: boolean;
    error?: string;
}

// ── Activity ─────────────────────────────────────────────────────────────────

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/**
 * The kinds this build can phrase. The wire accepts any string -- see `ActivityEventSchema`
 * -- so this is the authoring type, not the parsing one: it is what a `kind` literal in our
 * own code is checked against, while an incoming event may carry one nobody here knows yet.
 */
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivitySubject = z.infer<typeof ActivitySubjectSchema>;

/**
 * One event as its originator sent it. There is no message in here: the text is written in
 * the frontend out of `kind` and `data`. That is what lets an agent of an older version
 * stay useful -- it reports the same facts, and how they are worded is not its business --
 * and what makes filtering by kind and level exact instead of a search over sentences.
 */
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/**
 * An event as the server holds it.
 *
 * The two timestamps are the point. After an offline stretch an event from 03:00 arrives at
 * 08:00: the list is ordered by `occurredAt`, because that is when it happened, while "new
 * to me" rests on `seenBy`, so a late arrival cannot slip in below the entries a user has
 * already worked through. Their difference also exposes an agent whose clock is wrong.
 */
export interface ActivityRecord extends ActivityEvent {
    receivedAt: string;
    /**
     * Ids of the users who have seen the event. Numbers: they come from the JWT, which
     * carries `users.id` as the INTEGER it is.
     */
    seenBy: number[];
}

// ── Projects ─────────────────────────────────────────────────────────────────

export type Project = z.infer<typeof ProjectSchema>;

/**
 * A project together with what the current Docker state says about it. The counts are
 * derived on every read rather than stored: a stack that is torn down on one host shrinks
 * by itself, and nothing has to be kept in step with it.
 */
export interface ProjectSummary extends Project {
    /** Clients that currently run at least one container of this stack. */
    clientIds: string[];
    containerCount: number;
    /** Distinct `configImage` values across the members, not image ids. */
    imageCount: number;
}

/** `GET /api/v1/projects`. */
export interface ProjectListResponse {
    projects: ProjectSummary[];
    /**
     * Compose project names seen on the hosts that have no DIM entry yet -- the suggestions
     * the add dialog offers.
     */
    discovered: string[];
}
