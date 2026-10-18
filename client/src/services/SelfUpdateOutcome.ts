import { ActivityKind, ActivityLevel, ActivitySubject } from "@dim/shared";

/**
 * What a self-update hands from one agent to the next, as pure functions: the environment the
 * helper is started with, and the event its outcome becomes. `SelfUpdateService` does the
 * work; nothing in here touches Docker, the disk or the clock.
 */

/** The variables only a helper carries. The container it creates must not inherit them. */
export const HELPER_ENV_KEYS = [
    "DIM_HELPER_MODE",
    "DIM_OLD_CONTAINER",
    "DIM_OLD_VERSION",
    "DIM_SELF_UPDATE_VERIFY_SECONDS",
    "DIM_CORRELATION_ID",
];

/**
 * The outcome of one self-update. `pending` while the new container proves itself: the new
 * agent is already running then and reads the file before the helper has decided.
 *
 * The image fields are missing where the helper failed before it could inspect anything.
 */
export interface SelfUpdateOutcome {
    outcome: "pending" | "completed" | "rolled-back" | "failed";
    container: string;
    /**
     * The action or auto-update run that asked for the update, so its outcome joins that
     * group. Missing in a file left by a helper older than this field, and `null` where the
     * agent that started the helper did not pass one on.
     */
    correlationId?: string | null;
    fromImageId?: string;
    fromVersion: string | null;
    toImage?: string;
    toImageId?: string;
    toVersion: string;
    startedAt: string;
    finishedAt?: string;
    error?: string;
    rollbackError?: string;
}

/** What `ActivityService.report` is called with for an outcome. */
export interface SelfUpdateReport {
    kind: ActivityKind;
    level: ActivityLevel;
    occurredAt?: string;
    correlationId: string | null;
    subject: ActivitySubject;
    data: Record<string, unknown>;
}

/** An id worth passing on: a string with something in it. Anything else is none. */
export function correlationIdOf(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const id = value.trim();
    return id.length > 0 ? id : null;
}

/**
 * The environment of the helper. It runs the new image and may not read this agent's
 * config.yaml the way this agent does, so it is told what it needs here.
 */
export function helperEnv(input: {
    oldContainer: string;
    oldVersion: string;
    verifySeconds: number;
    dataDir?: string;
    correlationId?: string | null;
}): string[] {
    const env = [
        `DIM_HELPER_MODE=true`,
        `DIM_OLD_CONTAINER=${input.oldContainer}`,
        `DIM_OLD_VERSION=${input.oldVersion}`,
        `DIM_SELF_UPDATE_VERIFY_SECONDS=${input.verifySeconds}`,
    ];
    const dataDir = input.dataDir?.trim();
    if (dataDir) env.push(`DIM_CLIENT_DATA_DIR=${dataDir}`);
    const correlationId = correlationIdOf(input.correlationId);
    if (correlationId) env.push(`DIM_CORRELATION_ID=${correlationId}`);
    return env;
}

/** Filters the helper's own variables out of an environment array. */
export function filterHelperEnv(env: string[]): string[] {
    return env.filter((e) => !HELPER_ENV_KEYS.some((key) => e.startsWith(`${key}=`)));
}

/** The outcome file as read from disk, or `null` for one that is not an outcome at all. */
export function parseOutcome(raw: unknown): SelfUpdateOutcome | null {
    if (!raw || typeof raw !== "object") return null;
    const outcome = (raw as { outcome?: unknown }).outcome;
    return typeof outcome === "string" ? (raw as SelfUpdateOutcome) : null;
}

/**
 * The event an outcome is reported as, or `null` while it is still `pending`. It carries the
 * id of the action or run that asked for the update: the agent that reports it has no scope
 * open for that group, and nothing else would put it there.
 */
export function outcomeEvent(stored: SelfUpdateOutcome): SelfUpdateReport | null {
    if (stored.outcome === "pending") return null;
    const kind: ActivityKind =
        stored.outcome === "completed"
            ? "selfupdate.completed"
            : stored.outcome === "rolled-back"
              ? "selfupdate.rolledback"
              : "selfupdate.failed";
    return {
        kind,
        level: stored.outcome === "completed" ? "info" : "error",
        occurredAt: stored.finishedAt,
        correlationId: correlationIdOf(stored.correlationId),
        subject: {
            containerName: stored.container,
            ...(stored.toImage ? { imageRef: stored.toImage } : {}),
        },
        data: {
            fromVersion: stored.fromVersion,
            toVersion: stored.toVersion,
            ...(stored.fromImageId ? { fromImageId: stored.fromImageId } : {}),
            ...(stored.toImageId ? { toImageId: stored.toImageId } : {}),
            ...(stored.error ? { error: stored.error } : {}),
            ...(stored.rollbackError ? { rollbackError: stored.rollbackError } : {}),
        },
    };
}
