import { z } from "zod";
import {
    ACTIVITY_LEVELS,
    SCHEDULER_RUN_STATUSES,
    SCHEDULER_TRIGGERS,
    WEBHOOK_METHODS,
} from "./constants.js";
import {
    ActivityEventSchema,
    ClientSchema,
    ProjectSchema,
    TokenSchema,
} from "./schemas.js";

/**
 * What the server sends a browser, one schema per shape: the answers of the REST endpoints
 * and the payloads of the dashboard socket (`dashboardMessages.ts`).
 *
 * The frontend parses every response against one of these (`lib/api.ts`), and the types the
 * backend builds its answers with are inferred from them -- so a field renamed on one side
 * fails the other's build instead of arriving as `undefined`.
 *
 * They describe what is sent, not what is accepted: none of the input rules of `schemas.ts`
 * apply here. A row somebody edited by hand must not take a whole list down because its
 * name is longer than the form would allow. Nullability follows what the server sends,
 * which for a row read out of SQLite is `null` and not a missing key.
 *
 * Every object strips what it does not describe, so a newer agent or server that reports
 * more is read for what this build knows.
 */

// ── Clients ──────────────────────────────────────────────────────────────────

/**
 * A client as a browser receives it -- `GET /api/v1/clients` and `CLIENTS_UPDATE`.
 *
 * Not `ClientSchema`: every column that is nullable in SQLite arrives as `null`, not as a
 * missing key, and an id is whatever the row holds.
 */
export const ClientViewSchema = ClientSchema.extend({
    id: z.string(),
    displayName: z.string().nullish(),
    /** Null until the agent has connected once. */
    lastSeen: z.string().nullable(),
    version: z.string().nullish(),
    outboundTargetAddress: z.string().nullish(),
    createdAt: z.string().nullish(),
    updatedAt: z.string().nullish(),
});

/** `GET /api/v1/clients`. */
export const ClientListSchema = z.array(ClientViewSchema);

// ── Docker state ─────────────────────────────────────────────────────────────

const LabelsSchema = z.record(z.string(), z.string());

export const DockerPortSchema = z.object({
    ip: z.string().optional(),
    privatePort: z.number(),
    publicPort: z.number().optional(),
    type: z.string(),
});

export const DockerContainerSchema = z.object({
    id: z.string(),
    names: z.array(z.string()),
    image: z.string(),
    imageId: z.string(),
    command: z.string(),
    created: z.number(),
    /** running | exited | paused | restarting | dead | created */
    state: z.string(),
    // A status this build does not know reads as none, rather than refusing the host's state.
    health: z.enum(["healthy", "unhealthy", "starting", "none"]).optional().catch(undefined),
    // When the container last started and stopped, and how it exited. The dashboard derives the
    // status text ("Up 2 hours") from these, so its duration keeps counting between two state
    // pushes; Docker's own text would stand still. Optional: a container that never started
    // has no start time, and the agent sends none of them when inspecting the container fails.
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    exitCode: z.number().optional(),
    ports: z.array(DockerPortSchema),
    labels: LabelsSchema,
    configImage: z.string().optional(),
});

/**
 * The platform a local image was built for, as `image inspect` reports it (`Os`,
 * `Architecture`). The values follow the OCI naming a registry index uses for its entries
 * (`linux`, `amd64`, `arm64`), so the two compare as they are. A local image holds exactly
 * one platform, even when the tag it was pulled from points to an index of several.
 */
export const ImagePlatformSchema = z.object({
    os: z.string(),
    architecture: z.string(),
});

export const DockerImageUpdateCheckSchema = z.object({
    hasUpdate: z.boolean(),
    remoteDigest: z.string().nullable(),
    checkedAt: z.string(),
    error: z.string().optional(),
    /**
     * The `org.opencontainers.image.*` labels of the image the update would bring, fetched
     * for an image with an update only. Kept until the remote digest changes.
     */
    remoteLabels: LabelsSchema.nullish(),
});

export const DockerImageSchema = z.object({
    id: z.string(),
    parentId: z.string(),
    repoTags: z.array(z.string()),
    repoDigests: z.array(z.string()),
    created: z.number(),
    size: z.number(),
    labels: LabelsSchema.nullable(),
    /** Missing from agents that predate it, and for an image the agent could not inspect. */
    platform: ImagePlatformSchema.optional(),
    updateCheck: DockerImageUpdateCheckSchema.optional(),
});

export const DockerVolumeSchema = z.object({
    name: z.string(),
    driver: z.string(),
    mountpoint: z.string(),
    createdAt: z.string(),
    labels: LabelsSchema.nullable(),
    scope: z.string(),
});

export const DockerNetworkSchema = z.object({
    id: z.string(),
    name: z.string(),
    driver: z.string(),
    scope: z.string(),
    ipam: z.object({
        driver: z.string(),
        config: z.array(z.object({ subnet: z.string().optional(), gateway: z.string().optional() })),
    }),
    internal: z.boolean(),
    attachable: z.boolean(),
    labels: LabelsSchema.nullable(),
    created: z.string(),
});

/** `GET /api/v1/clients/:clientId/docker` and the state inside `DOCKER_STATE_UPDATE`. */
export const DockerStateSchema = z.object({
    containers: z.array(DockerContainerSchema),
    images: z.array(DockerImageSchema),
    volumes: z.array(DockerVolumeSchema),
    networks: z.array(DockerNetworkSchema),
    updatedAt: z.string(),
});

// ── Image update checks ──────────────────────────────────────────────────────

export const ImageUpdateCheckResultSchema = z.object({
    repoTag: z.string(),
    localDigest: z.string().nullable(),
    remoteDigest: z.string().nullable(),
    hasUpdate: z.boolean(),
    /** The platform the check compared against; absent when none was given. */
    platform: ImagePlatformSchema.optional(),
    /** Digest of the remote manifest for `platform`, when the registry has one. */
    remotePlatformDigest: z.string().nullish(),
    /**
     * The `org.opencontainers.image.*` labels of that manifest's image. Fetched only when
     * `hasUpdate` is true and `platform` is known; `null` when the registry did not give
     * them.
     */
    remoteLabels: LabelsSchema.nullish(),
    error: z.string().optional(),
    /**
     * Whether the registry turned the request away over its rate limit. The caller that
     * sweeps many images reads it to stop asking: every further request would be refused
     * the same way.
     */
    rateLimited: z.boolean().optional(),
    /**
     * With `rateLimited`: how long the registry asked not to be asked again, from its
     * `Retry-After` header or `RATE_LIMIT_FALLBACK_SECONDS` when it sent none.
     */
    retryAfterSeconds: z.number().optional(),
    /** The registry's `ratelimit-remaining` header on its last answer, when it sends one. */
    rateLimitRemaining: z.number().optional(),
});

/** One client's answer inside `ImageUpdateCheckResponse`. */
export const ClientImageUpdateCheckSchema = z.object({
    clientId: z.string(),
    platform: ImagePlatformSchema.optional(),
    hasUpdate: z.boolean(),
    remoteDigest: z.string().nullable(),
    error: z.string().optional(),
});

/**
 * `GET /api/v1/docker/images/check-update`. The same tag can stand for a different image
 * on every platform, so the answer is given per client; the top-level fields sum it up
 * (`hasUpdate` if any client has one).
 */
export const ImageUpdateCheckResponseSchema = ImageUpdateCheckResultSchema.extend({
    results: z.array(ClientImageUpdateCheckSchema),
});

// ── Schedulers ───────────────────────────────────────────────────────────────

/**
 * How the scheduled update check fares with one registry host. A rate limit pauses that
 * host alone; the others go on being asked.
 */
export const RegistryStatusSchema = z.object({
    /** `registry-1.docker.io`, `ghcr.io`, … */
    registry: z.string(),
    /** How many check targets are pulled from this registry. */
    targets: z.number(),
    /** How many of them the last sweep actually asked about. */
    checked: z.number(),
    lastCheckedAt: z.string().nullable(),
    /** Until when the registry is left alone after a rate limit; null when it is not. */
    pausedUntil: z.string().nullable(),
    /** The last `ratelimit-remaining` it sent; null for registries that send none. */
    remaining: z.number().nullable(),
    error: z.string().nullable(),
});

/**
 * One scheduler's status around the result its runs report.
 *
 * The result is read out of `scheduler_state`, where a run of an earlier version may have
 * left another shape behind. That reads as "no result" instead of refusing the status of
 * every scheduler along with it.
 */
function schedulerStatus<R extends z.ZodType>(result: R) {
    return z.object({
        isRunning: z.boolean(),
        /** Null when the scheduler is switched off. */
        nextRun: z.string().nullable(),
        lastRun: z
            .object({
                trigger: z.enum(SCHEDULER_TRIGGERS),
                status: z.enum(SCHEDULER_RUN_STATUSES),
                startedAt: z.string(),
                /** Null for a run the server did not live to finish (`interrupted`). */
                finishedAt: z.string().nullable(),
                /** Null unless the run succeeded, fully or in part. */
                result: result.nullable().catch(null),
                error: z.string().nullable(),
            })
            .nullable(),
    });
}

const RemovedSchema = z.object({ removed: z.number() });

/** Every scheduler the server runs, by its id. `SCHEDULER_IDS` lists the same four. */
export const SchedulerStatusesSchema = z.object({
    "image-update-check": schedulerStatus(
        z.object({ checked: z.number(), total: z.number(), pausedRegistries: z.array(z.string()) }),
    ).extend({ registries: z.array(RegistryStatusSchema) }),
    "image-cache-cleanup": schedulerStatus(
        z.object({ orphansRemoved: z.number(), expiredRemoved: z.number() }),
    ),
    "notification-cleanup": schedulerStatus(RemovedSchema),
    "token-cleanup": schedulerStatus(RemovedSchema),
});

/** `GET /api/v1/settings/scheduler-status`. */
export const SchedulerStatusResponseSchema = z.object({ schedulers: SchedulerStatusesSchema });

const schedulerUpdate = <Id extends keyof typeof SchedulerStatusesSchema.shape>(id: Id) =>
    z.object({ scheduler: z.literal(id), status: SchedulerStatusesSchema.shape[id] });

/** The payload of `SCHEDULER_STATUS_UPDATE`: one scheduler, whenever a run starts or ends. */
export const SchedulerStatusUpdateSchema = z.discriminatedUnion("scheduler", [
    schedulerUpdate("image-update-check"),
    schedulerUpdate("image-cache-cleanup"),
    schedulerUpdate("notification-cleanup"),
    schedulerUpdate("token-cleanup"),
]);

// ── Activity ─────────────────────────────────────────────────────────────────

/**
 * An event as the server holds it.
 *
 * The two timestamps are the point. After an offline stretch an event from 03:00 arrives at
 * 08:00: the list is ordered by `occurredAt`, because that is when it happened, while "new
 * to me" rests on `seen`, so a late arrival cannot slip in below the entries a user has
 * already worked through. Their difference also exposes an agent whose clock is wrong.
 */
export const ActivityRecordSchema = ActivityEventSchema.extend({
    receivedAt: z.string(),
    /**
     * Whether the user the list was read for has seen the event. Each user gets their own
     * answer; who else has seen it is not part of the record.
     */
    seen: z.boolean(),
});

/** `GET /api/v1/activity`, and the payload of `ACTIVITY_UPDATE` and `ACTIVITY_APPENDED`. */
export const ActivityListSchema = z.array(ActivityRecordSchema);

// ── Projects ─────────────────────────────────────────────────────────────────

/**
 * A project together with what the current Docker state says about it. The counts are
 * derived on every read rather than stored: a container that goes away leaves the project
 * by itself, and nothing has to be kept in step with it.
 */
export const ProjectSummarySchema = ProjectSchema.extend({
    name: z.string(),
    /** Clients that currently run at least one container of this project. */
    clientIds: z.array(z.string()),
    containerCount: z.number(),
    /** Distinct `configImage` values across the members, not image ids. */
    imageCount: z.number(),
    /**
     * Containers this project's query matches together with another project's. They are
     * counted in `containerCount` too, but they are updated through neither project.
     */
    conflictCount: z.number(),
});

/** `GET /api/v1/projects` and the payload of `PROJECTS_UPDATE`. */
export const ProjectListResponseSchema = z.object({
    projects: z.array(ProjectSummarySchema),
});

/** A container a query shares with another project. */
export const ProjectQueryConflictSchema = z.object({
    clientId: z.string(),
    containerId: z.string(),
    containerName: z.string(),
    projectId: z.string(),
    projectName: z.string(),
});

/** `POST /api/v1/projects/preview`. */
export const ProjectPreviewResponseSchema = z.object({
    members: z.array(z.object({ clientId: z.string(), containerId: z.string(), containerName: z.string() })),
    /** Containers the query shares with other projects; a query with any is not saved. */
    conflicts: z.array(ProjectQueryConflictSchema),
});

// ── Tokens, users, session ───────────────────────────────────────────────────

/** `GET /api/v1/tokens`. */
export const TokenListSchema = z.array(TokenSchema);

/** One row of `GET /api/v1/users`; the password hash is not among the columns. */
export const UserSchema = z.object({
    id: z.number(),
    username: z.string(),
    auth_methods: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
});

export const UserListSchema = z.array(UserSchema);

/** `GET /api/v1/me`: who the session belongs to, and until when. */
export const SessionUserSchema = z.object({
    id: z.number().nullish(),
    username: z.string().nullish(),
    expiresAt: z.string().nullish(),
});

/** `GET /api/auth/config`: which login the form offers. */
export const AuthConfigSchema = z.object({
    type: z.enum(["local", "oidc"]),
});

// ── Settings ─────────────────────────────────────────────────────────────────

/**
 * `GET /api/v1/settings/cleanup`: the settings block of config.yaml, as it stands. Loose,
 * like the file -- a value an operator wrote by hand is a number there and a string once
 * the UI has saved it.
 */
export const SettingsResponseSchema = z.record(z.string(), z.unknown());

/** `GET /api/v1/settings/container-auto-update/label`. */
export const AutoUpdateLabelSchema = z.object({ labelFilter: z.string() });

/** `POST /api/v1/settings/container-auto-update/validate-cron`. */
export const CronValidationSchema = z.object({ valid: z.boolean() });

// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * A webhook as the API returns it: what was configured, and how its last delivery went.
 * The shape of `WebhookSchema` without its input rules, see above.
 */
export const WebhookViewSchema = z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    url: z.string(),
    method: z.enum(WEBHOOK_METHODS),
    headers: z.record(z.string(), z.string()),
    bodyTemplate: z.string(),
    minLevel: z.enum(ACTIVITY_LEVELS),
    /** Kind patterns such as `container.*`; empty means every kind. */
    kinds: z.array(z.string()),
    timeoutMs: z.number(),
    /** The HTTP status of the last attempt; null when it never got an answer. */
    lastStatus: z.number().nullable(),
    lastError: z.string().nullable(),
    lastAttemptAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
});

/** `GET /api/v1/webhooks`. */
export const WebhookListSchema = z.array(WebhookViewSchema);

/** `POST /api/v1/webhooks/test`: what was sent, and what came back. */
export const WebhookTestResultSchema = z.object({
    ok: z.boolean(),
    status: z.number().nullable(),
    error: z.string().nullable(),
    /** The rendered body, as it went out. */
    body: z.unknown(),
    /** The start of the target's answer, for seeing why it refused. */
    response: z.string().nullable(),
});

export type User = z.infer<typeof UserSchema>;
export type SessionUser = z.infer<typeof SessionUserSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
