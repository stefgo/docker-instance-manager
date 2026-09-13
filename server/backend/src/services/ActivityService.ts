import { randomUUID } from "crypto";
import {
    ActivityBatchSchema,
    ActivityEvent,
    ActivityKind,
    ActivityLevel,
    ActivityRecord,
    ActivitySubject,
    WS_EVENTS,
    firstIssue,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { ActivityRepository } from "../repositories/ActivityRepository.js";
import { ProxyService } from "./ProxyService.js";

function broadcast(): void {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.ACTIVITY_UPDATE,
        payload: ActivityRepository.list(),
    });
}

/** What the server itself reports. Everything else is observed on a host, by its agent. */
interface ServerEventInput {
    kind: ActivityKind;
    level: ActivityLevel;
    clientId?: string | null;
    correlationId?: string | null;
    subject?: ActivitySubject | null;
    data?: Record<string, unknown> | null;
}

export class ActivityService {
    static list(): ActivityRecord[] {
        return ActivityRepository.list();
    }

    /**
     * Records an event the server is the originator of: the connection state of an agent,
     * a registration, an action a user asked for. Everything that happens *on* a host is
     * reported by that host -- the server does not infer it from what it sees.
     */
    static record(input: ServerEventInput): ActivityRecord {
        const event: ActivityEvent = {
            id: randomUUID(),
            occurredAt: new Date().toISOString(),
            source: "server",
            clientId: input.clientId ?? null,
            kind: input.kind,
            level: input.level,
            correlationId: input.correlationId ?? null,
            subject: input.subject ?? null,
            data: input.data ?? null,
        };
        const [stored] = ActivityRepository.insertMany([event], event.occurredAt);
        broadcast();
        return stored;
    }

    /**
     * Takes a batch from an agent and returns the ids it may drop from its queue.
     *
     * `clientId` and `source` are overwritten with what the connection says rather than
     * trusted from the payload: an agent may only ever speak about itself, and the ack has
     * to cover ids that were actually stored -- an id acknowledged but not written would be
     * dropped on the agent and lost for good.
     */
    static ingest(clientId: string, events: ActivityEvent[]): string[] {
        const receivedAt = new Date().toISOString();
        const owned = events.map((event) => ({
            ...event,
            source: "agent" as const,
            clientId,
        }));
        const stored = ActivityRepository.insertMany(owned, receivedAt);
        if (stored.length > 0) broadcast();
        return stored.map((e) => e.id);
    }

    /**
     * Handles one `ACTIVITY` batch from an agent and acknowledges what was stored.
     *
     * A batch that does not parse is dropped without an ack, so the agent keeps offering
     * it: silently acknowledging events the server never wrote would delete them on the one
     * side that still had them. The ack going missing is the harmless direction -- the
     * events arrive again and the ids they already carry make the second copy a no-op.
     */
    static handleBatch(clientId: string, payload: unknown): void {
        const parsed = ActivityBatchSchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn(
                { clientId, error: firstIssue(parsed.error) },
                "Discarding malformed ACTIVITY batch from agent",
            );
            return;
        }
        const ids = this.ingest(clientId, parsed.data.events);
        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.ACTIVITY_ACK, { ids });
        } catch {
            // The agent went away between its batch and this ack. It will offer the same
            // events again on its next connection.
        }
    }

    static markSeen(id: string, userId: number): boolean {
        const ok = ActivityRepository.markSeen(id, userId);
        if (ok) broadcast();
        return ok;
    }

    static markAllSeen(userId: number): void {
        ActivityRepository.markAllSeen(userId);
        broadcast();
    }

    static delete(id: string): boolean {
        const ok = ActivityRepository.delete(id);
        if (ok) broadcast();
        return ok;
    }

    static deleteAll(): void {
        ActivityRepository.deleteAll();
        broadcast();
    }
}
