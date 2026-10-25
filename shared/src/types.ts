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
    UPDATE_RESULTS,
    UPDATE_TRIGGERS,
} from "./constants.js";
import {
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    RegistrationTokenSchema,
    CreatedInboundClientSchema,
    CreateInboundClientSchema,
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
    AgentStatusSchema,
    ContainerUpdateSchema,
    AutoUpdateScheduleRunSchema,
    DockerHealthSchema,
    ImageCheckReportSchema,
    ImageChecksSchema,
    WebhookInputSchema,
    WebhookSchema,
} from "./schemas.js";
import {
    ActivityRecordSchema,
    ClientImageUpdateCheckSchema,
    ContainerUpdateRecordSchema,
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
export type RegistrationToken = z.infer<typeof RegistrationTokenSchema>;
export type CreatedInboundClient = z.infer<typeof CreatedInboundClientSchema>;

// REST request bodies
export type LoginPayload = z.infer<typeof LoginPayloadSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type CreateInboundClient = z.infer<typeof CreateInboundClientSchema>;
export type CreateOutboundClient = z.infer<typeof CreateOutboundClientSchema>;
export type UpdateClient = z.infer<typeof UpdateClientSchema>;
export type DockerActionRequest = z.infer<typeof DockerActionRequestSchema>;
export type CleanupSettings = z.infer<typeof CleanupSettingsSchema>;

// WS Payloads
export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type AutoUpdateScheduleRun = z.infer<typeof AutoUpdateScheduleRunSchema>;
export type DockerHealth = z.infer<typeof DockerHealthSchema>;
export type ImageCheckReport = z.infer<typeof ImageCheckReportSchema>;
export type ImageChecks = z.infer<typeof ImageChecksSchema>;

export interface WsMessage<T = unknown> {
    type: string;
    payload: T;
}

/** A message that carries nothing but its type. */
export type EmptyPayload = Record<string, never>;

/**
 * What an agent sends the server on its socket, by message type. The agent sends them
 * through the typed helpers in `Connection`; the server checks every payload against a
 * schema before it acts on it.
 *
 * - `AUTH` opens the session.
 * - States -- only the latest one means anything; sent after every handshake and on
 *   change: `DOCKER_UPDATE`, `AGENT_STATUS`, `IMAGE_CHECKS`.
 * - Events -- each one counts; queued until the server acknowledges them: `ACTIVITY`,
 *   `UPDATES`.
 * - Answers -- to one request of the server: `DOCKER_ACTION_RESULT`.
 */
export interface AgentMessages {
    AUTH: AuthPayload;
    DOCKER_UPDATE: Omit<DockerState, "updatedAt">;
    AGENT_STATUS: AgentStatus;
    IMAGE_CHECKS: ImageChecks;
    ACTIVITY: { events: ActivityEvent[] };
    UPDATES: { updates: ContainerUpdate[] };
    DOCKER_ACTION_RESULT: DockerActionResult;
}

/**
 * What the server sends an agent on its socket, by message type. The server sends them
 * through `ProxyService`; the agent checks every payload it acts on against a schema.
 */
export interface ServerMessages {
    AUTH_SUCCESS: EmptyPayload;
    AUTH_FAILURE: EmptyPayload;
    DOCKER_ACTION: DockerAction;
    REQUEST_STATE_UPDATE: EmptyPayload;
    AUTO_UPDATE_POLICY: AutoUpdatePolicy;
    AUTO_UPDATE_RUN: EmptyPayload;
    ACTIVITY_ACK: { ids: string[] };
    UPDATES_ACK: { ids: string[] };
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
    /** `updatesRemoved` is missing in a run recorded before the update history existed. */
    "notification-cleanup": { removed: number; updatesRemoved?: number };
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

// ── Container updates ────────────────────────────────────────────────────────

export type UpdateTrigger = (typeof UPDATE_TRIGGERS)[number];
export type UpdateResult = (typeof UPDATE_RESULTS)[number];

/** One container update as its agent reported it, see `ContainerUpdateSchema`. */
export type ContainerUpdate = z.infer<typeof ContainerUpdateSchema>;

/** A container update as the server stored and sends it. */
export type ContainerUpdateRecord = z.infer<typeof ContainerUpdateRecordSchema>;

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
