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
    DockerActionResultSchema,
    ProjectSchema,
    AutoUpdatePolicySchema,
    AutoUpdatePolicyProjectSchema,
    ActivityEventSchema,
    ActivitySubjectSchema,
    WebhookInputSchema,
    WebhookSchema,
} from "./schemas.js";
import {
    ActivityRecordSchema,
    ClientImageUpdateCheckSchema,
    ClientViewSchema,
    DockerContainerSchema,
    DockerImageSchema,
    DockerImageUpdateCheckSchema,
    DockerNetworkSchema,
    DockerPortSchema,
    DockerStateSchema,
    DockerVolumeSchema,
    ImagePlatformSchema,
    ImageUpdateCheckResponseSchema,
    ImageUpdateCheckResultSchema,
    ProjectListResponseSchema,
    ProjectPreviewResponseSchema,
    ProjectSummarySchema,
    RegistryStatusSchema,
    WebhookTestResultSchema,
} from "./responses.js";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

/**
 * Derived from the constants, so the value is written down in exactly one place and the
 * Zod enums in schemas.ts are built from the same objects.
 */
export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];
export type ConnectionMode = (typeof CONNECTION_MODE)[keyof typeof CONNECTION_MODE];

/** A client as the server sends it; see `ClientViewSchema` for why that is not `ClientSchema`. */
export type Client = z.infer<typeof ClientViewSchema>;
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
//
// Inferred from the schemas a browser's copy is parsed against (responses.ts), so the
// agent that builds a state, the server that stores it and the dashboard that reads it
// share one description of it.

export type DockerPort = z.infer<typeof DockerPortSchema>;
export type DockerContainer = z.infer<typeof DockerContainerSchema>;
export type ImagePlatform = z.infer<typeof ImagePlatformSchema>;
export type DockerImageUpdateCheck = z.infer<typeof DockerImageUpdateCheckSchema>;
export type DockerImage = z.infer<typeof DockerImageSchema>;
export type DockerVolume = z.infer<typeof DockerVolumeSchema>;
export type DockerNetwork = z.infer<typeof DockerNetworkSchema>;
export type DockerState = z.infer<typeof DockerStateSchema>;

export type ImageUpdateCheckResult = z.infer<typeof ImageUpdateCheckResultSchema>;

export type RegistryStatus = z.infer<typeof RegistryStatusSchema>;

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

export type ClientImageUpdateCheck = z.infer<typeof ClientImageUpdateCheckSchema>;
export type ImageUpdateCheckResponse = z.infer<typeof ImageUpdateCheckResponseSchema>;

export type DockerActionType = (typeof DOCKER_ACTION_TYPES)[number];

/** Derived from DockerActionSchema, which the agent checks every incoming action against. */
export type DockerAction = z.infer<typeof DockerActionSchema>;

export type DockerActionResult = z.infer<typeof DockerActionResultSchema>;

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

export type ActivityRecord = z.infer<typeof ActivityRecordSchema>;

// ── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookInput = z.input<typeof WebhookInputSchema>;
export type Webhook = z.infer<typeof WebhookSchema>;

export type WebhookTestResult = z.infer<typeof WebhookTestResultSchema>;

// ── Projects ─────────────────────────────────────────────────────────────────

export type Project = z.infer<typeof ProjectSchema>;

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

// ── Auto-update policy ───────────────────────────────────────────────────────

export type AutoUpdatePolicyProject = z.infer<typeof AutoUpdatePolicyProjectSchema>;

/**
 * What the server tells an agent about auto-update. Every schedule in it is already
 * resolved, so the agent stores it as it arrives and needs nothing else to decide when to
 * act -- including while the server is unreachable.
 */
export type AutoUpdatePolicy = z.infer<typeof AutoUpdatePolicySchema>;

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type ProjectPreviewResponse = z.infer<typeof ProjectPreviewResponseSchema>;
