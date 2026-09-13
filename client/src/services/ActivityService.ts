import { randomUUID } from "crypto";
import { ActivityEvent, ActivityKind, ActivityLevel, ActivitySubject } from "@dim/shared";
import { logger } from "@dim/shared/node";

/**
 * How long a scope stays open after its operation has finished and everything it expected
 * has been seen -- or, if something it expected never arrives, how long it waits before
 * giving up on it. Docker delivers the events of a recreate over its stream, so the last of
 * them can land after the call that caused it has already returned.
 */
const SCOPE_GRACE_MS = 15_000;

/**
 * How many events the agent holds while it has nowhere to send them. A host that has been
 * cut off for days must not grow its queue without bound; the oldest go first, because a
 * week-old container start is the least worth keeping.
 */
const MAX_QUEUED = 500;

/**
 * A running operation, and the events it is expected to cause.
 *
 * This is what replaces the server's old guesswork. The server used to match a change to an
 * operation by container name inside a 20-second window, because it only ever saw the
 * result. The agent does not have to match anything: it is the side performing the work, so
 * it knows which containers it is about to touch before it touches them, and stamps its
 * correlationId on what comes back.
 */
class Scope {
    /** Container names and ids this operation touches, as it learns them. */
    private readonly covered = new Set<string>();
    /** Event keys still awaited, e.g. `container.started:nextcloud-app`. */
    private readonly pending = new Set<string>();
    private finished = false;
    private timer: NodeJS.Timeout | null = null;

    constructor(
        readonly id: string,
        private readonly onClose: (scope: Scope) => void,
    ) {}

    covers(...subjects: string[]): void {
        for (const subject of subjects) {
            if (subject) this.covered.add(subject.replace(/^\//, ""));
        }
    }

    expect(...keys: string[]): void {
        for (const key of keys) this.pending.add(key);
    }

    /** Whether an event about this subject belongs to this operation. */
    claims(subject: ActivitySubject | null | undefined): boolean {
        if (!subject) return false;
        const name = subject.containerName?.replace(/^\//, "");
        return (
            (name !== undefined && this.covered.has(name)) ||
            (subject.containerId !== undefined && this.covered.has(subject.containerId)) ||
            (subject.imageRef !== undefined && this.covered.has(subject.imageRef))
        );
    }

    /** Ticks off an observed event; closes the scope once nothing is outstanding. */
    observed(kind: string, subject: ActivitySubject | null | undefined): void {
        const name = subject?.containerName?.replace(/^\//, "");
        if (name) this.pending.delete(`${kind}:${name}`);
        if (subject?.containerId) this.pending.delete(`${kind}:${subject.containerId}`);
        if (this.finished && this.pending.size === 0) this.close();
    }

    /**
     * The operation has returned. From here the scope lives only for the events still on
     * their way: it closes as soon as they have all been seen, and the grace window is the
     * fallback for one that never comes -- a container that failed to start, say.
     */
    finish(): void {
        this.finished = true;
        if (this.pending.size === 0) {
            this.close();
            return;
        }
        this.timer = setTimeout(() => {
            logger.debug(
                { correlationId: this.id, pending: [...this.pending] },
                "Correlation scope closed with events still expected",
            );
            this.close();
        }, SCOPE_GRACE_MS);
        this.timer.unref?.();
    }

    private close(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.onClose(this);
    }
}

export type CorrelationScope = Pick<Scope, "id" | "covers" | "expect">;

/**
 * The agent's activity reporting: it turns what it observes into events, stamps the
 * operation that caused them on the way past, and gets them to the server.
 *
 * Delivery is at-least-once. An event is kept until the server acknowledges its id, which
 * is why the id is given here and not there: a repeat then carries the same id and the
 * server's primary key makes the second copy a no-op. A run at three in the morning with no
 * server to talk to is therefore complete once the server is back.
 */
export class ActivityService {
    private static queue: ActivityEvent[] = [];
    private static scopes = new Set<Scope>();
    private static send: ((events: ActivityEvent[]) => boolean) | null = null;

    /**
     * Wires up the transport. `send` reports whether the batch went out; a false answer
     * leaves everything queued for the next connection.
     */
    static setTransport(send: (events: ActivityEvent[]) => boolean): void {
        this.send = send;
    }

    /** Opens a scope for one operation. The caller ends it with `endScope`. */
    static beginScope(correlationId: string): CorrelationScope {
        const scope = new Scope(correlationId, (s) => this.scopes.delete(s));
        this.scopes.add(scope);
        return scope;
    }

    static endScope(scope: CorrelationScope): void {
        (scope as Scope).finish();
    }

    /**
     * Records one event. The correlationId is not passed in: it is whichever open scope
     * claims this subject, so an operation does not have to thread its id through the event
     * watcher that happens to see its consequences.
     */
    static report(input: {
        kind: ActivityKind;
        level: ActivityLevel;
        occurredAt?: string;
        subject?: ActivitySubject | null;
        data?: Record<string, unknown> | null;
    }): void {
        const subject = input.subject ?? null;
        let correlationId: string | null = null;
        for (const scope of this.scopes) {
            if (!scope.claims(subject)) continue;
            correlationId = scope.id;
            scope.observed(input.kind, subject);
            break;
        }

        this.enqueue({
            id: randomUUID(),
            occurredAt: input.occurredAt ?? new Date().toISOString(),
            source: "agent",
            clientId: null,
            kind: input.kind,
            level: input.level,
            correlationId,
            subject,
            data: input.data ?? null,
        });
    }

    private static enqueue(event: ActivityEvent): void {
        this.queue.push(event);
        if (this.queue.length > MAX_QUEUED) {
            const dropped = this.queue.length - MAX_QUEUED;
            this.queue.splice(0, dropped);
            logger.warn({ dropped }, "Activity queue full, dropped the oldest events");
        }
        this.flush();
    }

    /** Offers everything unacknowledged to the server. Called on every reconnect too. */
    static flush(): void {
        if (this.queue.length === 0 || !this.send) return;
        this.send([...this.queue]);
    }

    /** Drops what the server has stored. Ids it does not name stay and are offered again. */
    static acknowledge(ids: string[]): void {
        if (ids.length === 0) return;
        const acked = new Set(ids);
        this.queue = this.queue.filter((event) => !acked.has(event.id));
    }
}
