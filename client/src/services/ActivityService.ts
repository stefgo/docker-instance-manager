import { randomUUID } from "crypto";
import {
    ActivityEvent,
    ActivityEventSchema,
    ActivityKind,
    ActivityLevel,
    ActivitySubject,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { AckQueue } from "../core/AckQueue.js";

/**
 * How long a scope stays open after its operation has finished and everything it expected
 * has been seen -- or, if something it expected never arrives, how long it waits before
 * giving up on it. Docker delivers the events of a recreate over its stream, so the last of
 * them can land after the call that caused it has already returned.
 */
const SCOPE_GRACE_MS = 15_000;

/**
 * How long an operation that has succeeded waits for the events it expected before it
 * reports its outcome. They follow the call that caused them within milliseconds; the limit
 * is for the one that never comes because the event stream is down.
 */
const OUTCOME_WAIT_MS = 3000;

/**
 * How many events the agent holds while it has nowhere to send them. A host that has been
 * cut off for days must not grow its queue without bound; the oldest go first, because a
 * week-old container start is the least worth keeping.
 */
const MAX_QUEUED = 500;

/**
 * How old a queued event may be. A host that has been cut off for a fortnight has nothing
 * worth telling about the container that started on the first morning, and delivering it
 * would drop a two-week-old line into the middle of today's list.
 */
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The queue on disk, so a restart does not lose what a run at three in the morning saw. */
const QUEUE_FILE = "queue.json";



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
    /** Released once nothing is pending, see `settled`. */
    private waiters: Array<() => void> = [];
    /** When the latest event this operation claimed occurred, in milliseconds. */
    private latest = 0;
    /** When this operation began, in milliseconds. */
    private readonly began = Date.now();
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

    /**
     * The container is about to be started and has a healthcheck: its first health status
     * belongs to this operation, however long after the scope it arrives. Called before the
     * start, so a fast first check cannot report before anybody waits for it; the caller
     * arms the wait once the start has returned, or cancels it if the start failed.
     */
    expectHealth(containerId: string): HealthWait {
        return ActivityService.awaitHealth(containerId, this.id);
    }

    /**
     * Whether an event about this subject belongs to this operation. One that occurred
     * before the operation began does not, whatever it is about: after a break in the event
     * stream Docker replays what was missed, and an exit from ten minutes ago is not a step
     * of the restart that happens to be running when it finally arrives.
     */
    claims(subject: ActivitySubject | null | undefined, occurredAt: string): boolean {
        if (!subject) return false;
        if (Date.parse(occurredAt) < this.began) return false;
        const name = subject.containerName?.replace(/^\//, "");
        return (
            (name !== undefined && this.covered.has(name)) ||
            (subject.containerId !== undefined && this.covered.has(subject.containerId)) ||
            (subject.imageRef !== undefined && this.covered.has(subject.imageRef))
        );
    }

    /** Ticks off an observed event; closes the scope once nothing is outstanding. */
    observed(kind: string, subject: ActivitySubject | null | undefined, occurredAt: string): void {
        const occurred = Date.parse(occurredAt);
        if (!Number.isNaN(occurred) && occurred > this.latest) this.latest = occurred;
        const name = subject?.containerName?.replace(/^\//, "");
        if (name) this.pending.delete(`${kind}:${name}`);
        if (subject?.containerId) this.pending.delete(`${kind}:${subject.containerId}`);
        if (subject?.imageRef) this.pending.delete(`${kind}:${subject.imageRef}`);
        if (this.pending.size > 0) return;
        for (const release of this.waiters.splice(0)) release();
        if (this.finished) this.close();
    }

    /** Resolves once everything expected has been seen, or after `timeoutMs` without it. */
    settled(timeoutMs: number): Promise<void> {
        if (this.pending.size === 0) return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, timeoutMs);
            this.waiters.push(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    /**
     * A time for the outcome of this operation: now, but after everything it caused. Docker
     * stamps its events itself, so the last of them can carry a later time than the moment
     * the call returned -- and the outcome would then sort in front of it.
     */
    outcomeTime(): string {
        return new Date(Math.max(Date.now(), this.latest + 1)).toISOString();
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

export type CorrelationScope = Pick<Scope, "id" | "covers" | "expect" | "expectHealth">;

/** A registered wait for a container's first health status, see `Scope.expectHealth`. */
export interface HealthWait {
    /** The start has returned: from now on the wait is checked against the host's state. */
    arm(): void;
    /** The start failed: no health status is coming. */
    cancel(): void;
}

/**
 * One container whose first health status is still owed to an operation.
 *
 * A healthcheck reports only after its first probe, which is often long after the scope of
 * the operation that started the container has closed. Keeping the scope open until then
 * would stamp everything else that happens to the container meanwhile too, so the health
 * status is correlated on its own: by container id, which is exact -- a recreate gives a
 * new id, and a start resets the status to `starting`, so the next status reported for
 * that id is the one this start caused.
 *
 * `seq` is 0 while the start is still running, and otherwise the position at which it was
 * armed. `reconcileHealth` only judges armed waits older than the snapshot it is given.
 */
interface HealthWaitEntry {
    correlationId: string;
    seq: number;
    /** When the wait was registered, in milliseconds. An older status is not the one awaited. */
    since: number;
}

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
    private static readonly queue = new AckQueue<ActivityEvent>({
        file: QUEUE_FILE,
        label: "activity events",
        parse: (value) => {
            const parsed = ActivityEventSchema.safeParse(value);
            return parsed.success ? parsed.data : null;
        },
        timeOf: (event) => event.occurredAt,
        maxItems: MAX_QUEUED,
        maxAgeMs: MAX_QUEUE_AGE_MS,
    });
    private static scopes = new Set<Scope>();
    private static healthWaits = new Map<string, HealthWaitEntry>();
    private static healthSeq = 0;

    /** Writes the queue out now, for a shutdown, see `AckQueue.persistNow`. */
    static persistNow(): void {
        this.queue.persistNow();
    }

    /**
     * Wires up the transport. `send` reports whether the batch went out; a false answer
     * leaves everything queued for the next connection.
     */
    static setTransport(send: (events: ActivityEvent[]) => boolean): void {
        this.queue.setTransport(send);
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
     * Waits for the events the operation expected and returns the time its outcome is to be
     * reported with, see `Scope.outcomeTime`. For an operation that succeeded: one that
     * failed has nothing more coming, and its caller asks for the time without waiting.
     */
    static async settled(scope: CorrelationScope, timeoutMs = OUTCOME_WAIT_MS): Promise<string> {
        await (scope as Scope).settled(timeoutMs);
        return (scope as Scope).outcomeTime();
    }

    /** The time a failed operation reports its outcome with, see `settled`. */
    static outcomeTime(scope: CorrelationScope): string {
        return (scope as Scope).outcomeTime();
    }

    /** See `Scope.expectHealth`. A newer wait for the same container replaces an older one. */
    static awaitHealth(containerId: string, correlationId: string): HealthWait {
        const entry: HealthWaitEntry = { correlationId, seq: 0, since: Date.now() };
        this.healthWaits.set(containerId, entry);
        // Both act only on their own entry: by the time a start returns, a later operation
        // on the same container may already have registered its own wait.
        return {
            arm: () => {
                if (this.healthWaits.get(containerId) === entry) entry.seq = ++this.healthSeq;
            },
            cancel: () => {
                if (this.healthWaits.get(containerId) === entry) this.healthWaits.delete(containerId);
            },
        };
    }

    /**
     * Marks the start of a state snapshot, for `reconcileHealth`. Taken before the snapshot
     * is read, so a wait armed while it is being read is not judged by it.
     */
    static healthMark(): number {
        return this.healthSeq;
    }

    /**
     * Drops the waits whose health status is no longer coming: the container is gone, no
     * longer running, or past `starting` -- the status arrived in an event this agent never
     * saw, because the event stream broke or Docker dropped it. Called with every snapshot
     * the watcher reads, so a wait cannot outlive the state it waits for; a container that
     * is still `starting` keeps its wait, however long its start period is.
     */
    static reconcileHealth(
        containers: ReadonlyArray<{ id: string; state: string; health?: string }>,
        mark: number,
    ): void {
        if (this.healthWaits.size === 0) return;
        const byId = new Map(containers.map((c) => [c.id, c]));
        for (const [containerId, entry] of this.healthWaits) {
            if (entry.seq === 0 || entry.seq > mark) continue;
            const container = byId.get(containerId);
            const running = container?.state === "running" || container?.state === "paused";
            if (!running || container?.health !== "starting") this.healthWaits.delete(containerId);
        }
    }

    /**
     * Records one event. The correlationId is usually not passed in: it is whichever open
     * scope claims this subject, so an operation does not have to thread its id through the
     * event watcher that happens to see its consequences.
     *
     * An operation reporting *about itself* -- the summary of an auto-update run, or a step
     * it decided not to take -- names its own id instead: it has no Docker event to be
     * recognised by, and there is nothing to look up about the group it heads.
     */
    static report(input: {
        kind: ActivityKind;
        level: ActivityLevel;
        occurredAt?: string;
        correlationId?: string | null;
        subject?: ActivitySubject | null;
        data?: Record<string, unknown> | null;
    }): void {
        const subject = input.subject ?? null;
        const occurredAt = input.occurredAt ?? new Date().toISOString();
        let correlationId: string | null = input.correlationId ?? null;
        if (input.kind === "container.health" && subject?.containerId) {
            const wait = this.healthWaits.get(subject.containerId);
            // A status replayed from before the start is the old one, not the awaited one.
            if (wait && !(Date.parse(occurredAt) < wait.since)) {
                this.healthWaits.delete(subject.containerId);
                correlationId ??= wait.correlationId;
            }
        }
        for (const scope of this.scopes) {
            if (correlationId !== null) break;
            if (!scope.claims(subject, occurredAt)) continue;
            correlationId = scope.id;
            scope.observed(input.kind, subject, occurredAt);
            break;
        }

        this.enqueue({
            id: randomUUID(),
            occurredAt,
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
    }

    /** Offers everything unacknowledged to the server. Called on every reconnect too. */
    static flush(): void {
        this.queue.flush();
    }

    /** Drops what the server has stored. Ids it does not name stay and are offered again. */
    static acknowledge(ids: string[]): void {
        this.queue.acknowledge(ids);
    }
}
