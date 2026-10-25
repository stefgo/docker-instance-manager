import {
    ContainerUpdate,
    ContainerUpdateBatchEnvelopeSchema,
    ContainerUpdateRecord,
    ContainerUpdateSchema,
    WS_EVENTS,
    firstIssue,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { ContainerUpdateRepository, StoredContainerUpdate } from "../repositories/ContainerUpdateRepository.js";
import { ProjectService } from "./ProjectService.js";
import { ProxyService } from "./ProxyService.js";

/**
 * The container update history: what the agents report as `UPDATES`, kept in its own table.
 *
 * Handled like the activity -- the agent gives each update its id, the server stores it
 * under that id and acknowledges only what is stored -- but without levels, overrides or
 * webhooks: an update is a record to look back on, not a notification.
 */
export class ContainerUpdateService {
    static list(): ContainerUpdateRecord[] {
        return ContainerUpdateRepository.list();
    }

    /**
     * Stores the updates of one agent and returns the ids it may drop from its queue.
     *
     * The projects the container is in are entered now, while the host's state still holds
     * it, so an update keeps its project after the query changes or the container is gone.
     */
    static ingest(clientId: string, updates: ContainerUpdate[]): string[] {
        if (updates.length === 0) return [];
        const resolve = ProjectService.activityProjectResolver();
        const owned: StoredContainerUpdate[] = updates.map((update) => ({
            ...update,
            clientId,
            projectIds: resolve(clientId, {
                containerName: update.containerName,
                ...(update.containerId ? { containerId: update.containerId } : {}),
            }),
        }));
        const { storedIds, inserted } = ContainerUpdateRepository.insertMany(owned, new Date().toISOString());
        if (inserted.length > 0) {
            ProxyService.broadcastToDashboard({ type: WS_EVENTS.UPDATES_APPENDED, payload: inserted });
        }
        return storedIds;
    }

    /**
     * Handles one `UPDATES` batch from an agent and acknowledges what it may drop.
     *
     * The rules are the activity's (`ActivityService.handleBatch`): never acknowledge what was
     * not stored, except an entry this build can never read -- re-offering it would hold up
     * the agent's queue for good. The entries are therefore parsed one by one.
     */
    static handleBatch(clientId: string, payload: unknown): void {
        const parsed = ContainerUpdateBatchEnvelopeSchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn({ clientId, error: firstIssue(parsed.error) }, "Discarding malformed UPDATES batch from agent");
            return;
        }

        const updates: ContainerUpdate[] = [];
        const unreadable: string[] = [];
        for (const candidate of parsed.data.updates) {
            const update = ContainerUpdateSchema.safeParse(candidate);
            if (update.success) {
                updates.push(update.data);
                continue;
            }
            const id = (candidate as { id?: unknown } | null)?.id;
            if (typeof id === "string" && id.length > 0) {
                unreadable.push(id);
                logger.warn(
                    { clientId, id, error: firstIssue(update.error) },
                    "Acknowledging an unreadable container update without storing it",
                );
            } else {
                logger.warn({ clientId, error: firstIssue(update.error) }, "Discarding a container update without a usable id");
            }
        }

        let stored: string[];
        try {
            stored = this.ingest(clientId, updates);
        } catch (err) {
            // Nothing acknowledged: the agent offers the same updates again.
            logger.error({ err, clientId }, "Could not store the container updates of an agent");
            stored = [];
        }
        const ids = [...stored, ...unreadable];
        if (ids.length === 0) return;
        try {
            ProxyService.sendToAgent(clientId, WS_EVENTS.UPDATES_ACK, { ids });
        } catch {
            // The agent went away between its batch and this ack; it offers them again.
        }
    }
}
