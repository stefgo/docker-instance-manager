import { ActivityKind, ActivityLevel, ActivitySubject } from "@dim/shared";

/** The shape of a Docker event, narrowed to what is read out of it. */
export interface DockerEvent {
    Type?: string;
    Action?: string;
    time?: number;
    timeNano?: number;
    Actor?: {
        ID?: string;
        Attributes?: Record<string, string>;
    };
}

export interface MappedActivity {
    kind: ActivityKind;
    level: ActivityLevel;
    occurredAt: string;
    subject: ActivitySubject;
    data: Record<string, unknown> | null;
}

/**
 * Which container action becomes which kind. `kill` is in here although a `die` with the exit
 * code usually follows: it is the one fact that tells an exit somebody asked for -- a
 * `docker stop`, a `compose down` -- from a container that ended by itself. The dashboard
 * reads that off the order of the two, so the agent reports both and remembers neither.
 */
const CONTAINER_KINDS: Record<string, ActivityKind> = {
    create: "container.created",
    start: "container.started",
    stop: "container.stopped",
    destroy: "container.removed",
    kill: "container.killed",
    die: "container.died",
    oom: "container.oom",
    health_status: "container.health",
};

const IMAGE_KINDS: Record<string, ActivityKind> = {
    pull: "image.pulled",
    delete: "image.removed",
};

function occurredAt(event: DockerEvent): string {
    // timeNano is nanoseconds, time is seconds. Neither is trusted to be there: an event
    // without a usable clock is stamped on arrival rather than dropped.
    if (typeof event.timeNano === "number" && event.timeNano > 0) {
        return new Date(event.timeNano / 1_000_000).toISOString();
    }
    if (typeof event.time === "number" && event.time > 0) {
        return new Date(event.time * 1000).toISOString();
    }
    return new Date().toISOString();
}

function containerSubject(event: DockerEvent): ActivitySubject {
    const attrs = event.Actor?.Attributes ?? {};
    return {
        ...(attrs.name ? { containerName: attrs.name.replace(/^\//, "") } : {}),
        ...(event.Actor?.ID ? { containerId: event.Actor.ID } : {}),
        ...(attrs.image ? { imageRef: attrs.image } : {}),
    };
}

/**
 * Turns one Docker event into the activity event it stands for, or null when it is not one
 * this agent reports.
 *
 * This is the content the agent used to throw away: it watched the event stream only to
 * know that *something* had changed, pushed a full state snapshot and left the server to
 * work out what had happened by comparing it with the previous one. An exit code, an OOM
 * kill, a health transition and a `die`/`start` pair inside one second are all invisible in
 * such a diff -- they exist only here, in the event itself.
 */
export function mapDockerEvent(event: DockerEvent): MappedActivity | null {
    const action = event.Action ?? "";

    if (event.Type === "container") {
        // "health_status: healthy" -- the state is part of the action string.
        const isHealth = action.startsWith("health_status");
        const kind = isHealth ? CONTAINER_KINDS.health_status : CONTAINER_KINDS[action];
        if (!kind) return null;

        const subject = containerSubject(event);
        const attrs = event.Actor?.Attributes ?? {};

        if (isHealth) {
            const status = action.split(":")[1]?.trim() ?? "unknown";
            return {
                kind,
                level: status === "unhealthy" ? "warning" : "info",
                occurredAt: occurredAt(event),
                subject,
                data: { status },
            };
        }

        if (kind === "container.died") {
            const exitCode = Number.parseInt(attrs.exitCode ?? "", 10);
            const code = Number.isNaN(exitCode) ? null : exitCode;
            return {
                kind,
                // A container that ends on 0 did what it was told; anything else did not.
                level: code === 0 ? "info" : "warning",
                occurredAt: occurredAt(event),
                subject,
                data: { exitCode: code },
            };
        }

        if (kind === "container.killed") {
            // Docker names the signal by its number ("15"); a name is kept as it comes.
            const signal = attrs.signal ? Number.parseInt(attrs.signal, 10) : Number.NaN;
            return {
                kind,
                // A stop is announced by it and reported by the `die` that follows; on its
                // own it is bookkeeping, such as a configuration reload by SIGHUP.
                level: "trace",
                occurredAt: occurredAt(event),
                subject,
                data: { signal: Number.isNaN(signal) ? attrs.signal ?? null : signal },
            };
        }

        return {
            kind,
            level: kind === "container.oom" ? "error" : "info",
            occurredAt: occurredAt(event),
            subject,
            data: null,
        };
    }

    if (event.Type === "image") {
        const kind = IMAGE_KINDS[action];
        if (!kind) return null;
        const attrs = event.Actor?.Attributes ?? {};
        // A pull names the repository alone in `name` and the reference that was pulled --
        // tag or digest included -- in the ID. The ID is what the operation pulled, and so
        // what its correlation scope knows; the bare repository would match no scope.
        const imageRef = action === "pull"
            ? event.Actor?.ID ?? attrs.name ?? ""
            : attrs.name ?? event.Actor?.ID ?? "";
        return {
            kind,
            level: "info",
            occurredAt: occurredAt(event),
            subject: { imageRef },
            data: null,
        };
    }

    // Volumes, networks, renames, pauses: they move the state and are pushed as such, but
    // there is no kind for them, and inventing one the dashboard cannot phrase would put an
    // unreadable line in the list.
    return null;
}
