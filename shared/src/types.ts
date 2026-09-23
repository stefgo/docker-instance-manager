import { z } from "zod";
import {
    ACTIVITY_KINDS,
    ACTIVITY_LEVELS,
    ACTIVITY_SOURCES,
    CLIENT_STATUS,
    CONNECTION_MODE,
    DOCKER_ACTION_TYPES,
    SCHEDULER_IDS,
    SCHEDULER_RUN_STATUSES,
    SCHEDULER_TRIGGERS,
} from "./constants.js";
import {
    ClientSchema,
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    TokenSchema,
    CreatedTokenSchema,
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
    AutoUpdatePolicySchema,
    AutoUpdatePolicyProjectSchema,
    ActivityEventSchema,
    ActivitySubjectSchema,
} from "./schemas.js";
import type { ProjectQueryConflict } from "./projectQuery.js";

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
export type CreatedToken = z.infer<typeof CreatedTokenSchema>;

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

export interface WsMessage<T = unknown> {
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
    health?: "healthy" | "unhealthy" | "starting" | "none";
    // When the container last started and stopped, and how it exited. The dashboard derives the
    // status text ("Up 2 hours") from these, so its duration keeps counting between two state
    // pushes; Docker's own text would stand still. Optional: a container that never started
    // has no start time, and the agent sends none of them when inspecting the container fails.
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
    ports: DockerPort[];
    labels: Record<string, string>;
    configImage?: string;
}

/**
 * The platform a local image was built for, as `image inspect` reports it (`Os`,
 * `Architecture`). The values follow the OCI naming a registry index uses for its entries
 * (`linux`, `amd64`, `arm64`), so the two compare as they are. A local image holds exactly
 * one platform, even when the tag it was pulled from points to an index of several.
 */
export interface ImagePlatform {
    os: string;
    architecture: string;
}

export interface DockerImageUpdateCheck {
    hasUpdate: boolean;
    remoteDigest: string | null;
    checkedAt: string;
    error?: string;
    /**
     * The `org.opencontainers.image.*` labels of the image the update would bring, fetched
     * for an image with an update only. Kept until the remote digest changes.
     */
    remoteLabels?: Record<string, string> | null;
}

export interface DockerImage {
    id: string;
    parentId: string;
    repoTags: string[];
    repoDigests: string[];
    created: number;
    size: number;
    labels: Record<string, string> | null;
    /** Missing from agents that predate it, and for an image the agent could not inspect. */
    platform?: ImagePlatform;
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
    /** The platform the check compared against; absent when none was given. */
    platform?: ImagePlatform;
    /** Digest of the remote manifest for `platform`, when the registry has one. */
    remotePlatformDigest?: string | null;
    /**
     * The `org.opencontainers.image.*` labels of that manifest's image. Fetched only when
     * `hasUpdate` is true and `platform` is known; `null` when the registry did not give
     * them.
     */
    remoteLabels?: Record<string, string> | null;
    error?: string;
    /**
     * Whether the registry turned the request away over its rate limit. The caller that
     * sweeps many images reads it to stop asking: every further request would be refused
     * the same way.
     */
    rateLimited?: boolean;
    /**
     * With `rateLimited`: how long the registry asked not to be asked again, from its
     * `Retry-After` header or `RATE_LIMIT_FALLBACK_SECONDS` when it sent none.
     */
    retryAfterSeconds?: number;
    /** The registry's `ratelimit-remaining` header on its last answer, when it sends one. */
    rateLimitRemaining?: number;
}

/**
 * How the scheduled update check fares with one registry host. A rate limit pauses that
 * host alone; the others go on being asked.
 */
export interface RegistryStatus {
    /** `registry-1.docker.io`, `ghcr.io`, … */
    registry: string;
    /** How many check targets are pulled from this registry. */
    targets: number;
    /** How many of them the last sweep actually asked about. */
    checked: number;
    lastCheckedAt: string | null;
    /** Until when the registry is left alone after a rate limit; null when it is not. */
    pausedUntil: string | null;
    /** The last `ratelimit-remaining` it sent; null for registries that send none. */
    remaining: number | null;
    error: string | null;
}

export type SchedulerId = (typeof SCHEDULER_IDS)[number];
export type SchedulerTrigger = (typeof SCHEDULER_TRIGGERS)[number];
export type SchedulerRunStatus = (typeof SCHEDULER_RUN_STATUSES)[number];

/** What each scheduler reports as the result of a run. */
export interface SchedulerRunResults {
    "image-update-check": { checked: number; total: number; pausedRegistries: string[] };
    "image-cache-cleanup": { orphansRemoved: number; expiredRemoved: number };
    "notification-cleanup": { removed: number };
    "token-cleanup": { removed: number };
}

/** The last run a scheduler finished, as `scheduler_state` holds it. */
export interface SchedulerRunSummary<Id extends SchedulerId = SchedulerId> {
    trigger: SchedulerTrigger;
    status: SchedulerRunStatus;
    startedAt: string;
    /** Null for a run the server did not live to finish (`interrupted`). */
    finishedAt: string | null;
    /** Null unless the run succeeded, fully or in part. */
    result: SchedulerRunResults[Id] | null;
    error: string | null;
}

export interface SchedulerStatus<Id extends SchedulerId = SchedulerId> {
    isRunning: boolean;
    /** Null when the scheduler is switched off. */
    nextRun: string | null;
    lastRun: SchedulerRunSummary<Id> | null;
}

export interface ImageUpdateCheckSchedulerStatus extends SchedulerStatus<"image-update-check"> {
    registries: RegistryStatus[];
}

/** `GET /api/v1/settings/scheduler-status`: every scheduler the server runs. */
export type SchedulerStatuses = {
    [Id in SchedulerId]: Id extends "image-update-check" ? ImageUpdateCheckSchedulerStatus : SchedulerStatus<Id>;
};

/** The payload of `SCHEDULER_STATUS_UPDATE`: one scheduler, whenever a run starts or ends. */
export type SchedulerStatusUpdate = {
    [Id in SchedulerId]: { scheduler: Id; status: SchedulerStatuses[Id] };
}[SchedulerId];

/** One client's answer inside `ImageUpdateCheckResponse`. */
export interface ClientImageUpdateCheck {
    clientId: string;
    platform?: ImagePlatform;
    hasUpdate: boolean;
    remoteDigest: string | null;
    error?: string;
}

/**
 * `GET /api/v1/docker/images/check-update`. The same tag can stand for a different image
 * on every platform, so the answer is given per client; the top-level fields sum it up
 * (`hasUpdate` if any client has one).
 */
export interface ImageUpdateCheckResponse extends ImageUpdateCheckResult {
    results: ClientImageUpdateCheck[];
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
 * derived on every read rather than stored: a container that goes away leaves the project
 * by itself, and nothing has to be kept in step with it.
 */
export interface ProjectSummary extends Project {
    /** Clients that currently run at least one container of this project. */
    clientIds: string[];
    containerCount: number;
    /** Distinct `configImage` values across the members, not image ids. */
    imageCount: number;
    /**
     * Containers this project's query matches together with another project's. They are
     * counted in `containerCount` too, but they are updated through neither project.
     */
    conflictCount: number;
}

// ── Auto-update policy ───────────────────────────────────────────────────────

export type AutoUpdatePolicyProject = z.infer<typeof AutoUpdatePolicyProjectSchema>;

/**
 * What the server tells an agent about auto-update. Every schedule in it is already
 * resolved, so the agent stores it as it arrives and needs nothing else to decide when to
 * act -- including while the server is unreachable.
 */
export type AutoUpdatePolicy = z.infer<typeof AutoUpdatePolicySchema>;

/** `GET /api/v1/projects`. */
export interface ProjectListResponse {
    projects: ProjectSummary[];
    /**
     * Compose project names seen on the hosts whose containers belong to no project yet --
     * the suggestions the editor offers.
     */
    discovered: string[];
}

/** `POST /api/v1/projects/preview`. */
export interface ProjectPreviewResponse {
    members: Array<{ clientId: string; containerId: string; containerName: string }>;
    /** Containers the query shares with other projects; a query with any is not saved. */
    conflicts: ProjectQueryConflict[];
}

