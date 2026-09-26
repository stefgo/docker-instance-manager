import { ActivityRecord, registryLabel } from "@dim/shared";

/**
 * Turns an event into the sentence a reader sees.
 *
 * This is the one place a wording exists. An agent reports `container.died` with an exit
 * code and nothing else, so an agent of an older version stays useful without knowing how
 * today's dashboard phrases things -- and a wording can be changed here without asking a
 * fleet of hosts to update.
 *
 * A kind nobody here knows still has to read as something: the fallback prints the kind
 * itself, because dropping the line would hide an observation that cannot be made again.
 */

function name(event: ActivityRecord): string {
    return event.subject?.containerName ?? event.subject?.containerId?.slice(0, 12) ?? "a container";
}

/** What an action was aimed at, or "" for one without a target (image:prune). */
function actionTarget(event: ActivityRecord): string {
    if (event.subject?.imageRef) return event.subject.imageRef;
    return event.subject?.containerName || event.subject?.containerId ? name(event) : "";
}

/** The target by a name a reader recognises, or "" if all there is to go by is an ID. */
function readableTarget(event: ActivityRecord): string {
    return event.subject?.imageRef ?? event.subject?.containerName ?? "";
}

function image(event: ActivityRecord): string {
    return event.subject?.imageRef ?? "an image";
}

function str(event: ActivityRecord, key: string): string | null {
    const value = event.data?.[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

/** The server's schedulers as the settings page names them. */
const SCHEDULER_NAMES: Record<string, string> = {
    "image-update-check": "Image update check",
    "image-cache-cleanup": "Image version cache cleanup",
    "notification-cleanup": "Activity cleanup",
    "token-cleanup": "Token cleanup",
};

/** A pause as a reader would say it: minutes below two hours, hours above. */
function formatPause(seconds: number): string {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function host(event: ActivityRecord): string {
    return str(event, "clientName") ?? "the client";
}

export function activityMessage(event: ActivityRecord): string {
    switch (event.kind) {
        case "container.created":
            return `Container ${name(event)} created`;
        case "container.started":
            return `Container ${name(event)} started`;
        case "container.stopped":
            return `Container ${name(event)} stopped`;
        case "container.removed":
            return `Container ${name(event)} removed`;
        case "container.died": {
            const code = event.data?.exitCode;
            if (code === 0) return `Container ${name(event)} exited normally`;
            if (typeof code === "number") return `Container ${name(event)} exited with code ${code}`;
            return `Container ${name(event)} exited`;
        }
        case "container.oom":
            return `Container ${name(event)} was killed: out of memory`;
        case "container.health": {
            const status = str(event, "status") ?? "unknown";
            return `Container ${name(event)} is ${status}`;
        }
        case "image.pulled":
            return `Image ${image(event)} pulled`;
        case "image.removed":
            return `Image ${image(event)} removed`;
        case "autoupdate.run": {
            const updated = event.data?.updated;
            const count = typeof updated === "number" ? updated : 0;
            return `Auto-update run: ${count} container${count === 1 ? "" : "s"} updated`;
        }
        case "autoupdate.skipped":
            return `Auto-update of ${image(event)} postponed`;
        case "autoupdate.conflict": {
            const projects = event.data?.projectNames;
            const names = Array.isArray(projects) ? projects.join(", ") : "several projects";
            return event.data?.fallback === "host"
                ? `Container ${name(event)} matches ${names}: updated through its label on the host schedule`
                : `Container ${name(event)} matches ${names}: excluded from auto-update`;
        }
        case "autoupdate.interrupted":
            return "An auto-update run was interrupted and is being repeated";
        case "client.connected":
            return `${host(event)} connected`;
        case "client.disconnected":
            return `${host(event)} disconnected`;
        case "client.registered":
            return `${str(event, "hostname") ?? host(event)} registered`;
        case "action.requested": {
            const action = str(event, "action") ?? "an action";
            const target = actionTarget(event);
            const prefix = event.data?.autoUpdate === true ? "Auto-update: " : "";
            return target
                ? `${prefix}${action} requested for ${target}`
                : `${prefix}${action} requested`;
        }
        case "imagecheck.interrupted": {
            const checked = event.data?.checked;
            const total = event.data?.total;
            const registry = str(event, "registry");
            const retryAfter = event.data?.retryAfterSeconds;
            // Events written before the check paused per registry carry neither of the two.
            const at = registry ? ` at ${registryLabel(registry)}` : "";
            const pause = typeof retryAfter === "number" ? `, paused for ${formatPause(retryAfter)}` : "";
            return typeof checked === "number" && typeof total === "number"
                ? `Image update check stopped${at} after ${checked} of ${total} images${pause}`
                : `Image update check stopped early${at}${pause}`;
        }
        case "scheduler.failed": {
            const scheduler = str(event, "scheduler");
            const error = str(event, "error");
            const what = scheduler ? (SCHEDULER_NAMES[scheduler] ?? scheduler) : "A scheduled job";
            return error ? `${what} failed: ${error}` : `${what} failed`;
        }
        case "action.completed": {
            const action = str(event, "action") ?? "The action";
            const target = readableTarget(event);
            return target ? `${action} completed for ${target}` : `${action} completed`;
        }
        case "action.failed": {
            const action = str(event, "action") ?? "The action";
            // The server's record names its target; the agent's knows only an ID, which the
            // head of the group already names more readably.
            const target = event.source === "agent" ? readableTarget(event) : actionTarget(event);
            const error = str(event, "error");
            const line = target ? `${action} failed for ${target}` : `${action} failed`;
            return error ? `${line}: ${error}` : line;
        }
        case "action.unconfirmed": {
            const action = str(event, "action") ?? "The action";
            const why = str(event, "reason") === "disconnected"
                ? "the connection was lost"
                : "no answer in time";
            return `${action} sent to ${host(event)}, result pending: ${why}`;
        }
        default:
            // A kind from an agent of another version. Better an unpolished line than none.
            return event.kind;
    }
}

/** The second line of an expanded row: what the message left out. */
export function activityDetail(event: ActivityRecord): string | null {
    const error = str(event, "error");
    if (error) return error;

    if (event.kind === "autoupdate.run") {
        const parts: string[] = [];
        for (const key of ["eligible", "pulled", "updated", "failed", "skipped"]) {
            const value = event.data?.[key];
            if (typeof value === "number") parts.push(`${key}: ${value}`);
        }
        if (event.data?.catchUp === true) {
            const missed = str(event, "scheduledFor");
            parts.push(missed ? `caught up (due ${missed})` : "caught up");
        }
        if (event.data?.manual === true) parts.push("asked for");
        return parts.length > 0 ? parts.join(", ") : null;
    }

    return null;
}
