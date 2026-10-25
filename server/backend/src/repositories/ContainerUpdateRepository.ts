import db from "../core/Database.js";
import type { ContainerUpdate, ContainerUpdateRecord, UpdateResult, UpdateTrigger } from "@dim/shared";

/** A row of `container_updates` (migration 30). */
interface ContainerUpdateRow {
    id: string;
    client_id: string;
    occurred_at: string;
    received_at: string;
    container_name: string;
    container_id: string | null;
    image_ref: string;
    from_image_ref: string | null;
    from_image_id: string | null;
    to_image_id: string | null;
    from_digest: string | null;
    to_digest: string | null;
    from_version: string | null;
    to_version: string | null;
    trigger: string;
    result: string;
    error: string | null;
    correlation_id: string | null;
    /** JSON array of project ids; NULL for none. */
    project_ids: string | null;
}

/** An update as it is stored: who reported it and which projects the container was in then. */
export interface StoredContainerUpdate extends ContainerUpdate {
    clientId: string;
    projectIds: string[];
}

function parseProjectIds(text: string | null): string[] {
    if (!text) return [];
    try {
        const value = JSON.parse(text) as unknown;
        return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

function rowToRecord(row: ContainerUpdateRow): ContainerUpdateRecord {
    return {
        id: row.id,
        clientId: row.client_id,
        occurredAt: row.occurred_at,
        receivedAt: row.received_at,
        containerName: row.container_name,
        containerId: row.container_id,
        imageRef: row.image_ref,
        fromImageRef: row.from_image_ref,
        fromImageId: row.from_image_id,
        toImageId: row.to_image_id,
        fromDigest: row.from_digest,
        toDigest: row.to_digest,
        fromVersion: row.from_version,
        toVersion: row.to_version,
        trigger: row.trigger as UpdateTrigger,
        result: row.result as UpdateResult,
        error: row.error,
        correlationId: row.correlation_id,
        projectIds: parseProjectIds(row.project_ids),
    };
}

export class ContainerUpdateRepository {
    /** Every stored update, newest first by when it happened on its host. */
    static list(): ContainerUpdateRecord[] {
        const rows = db
            .prepare("SELECT * FROM container_updates ORDER BY occurred_at DESC, received_at DESC")
            .all() as ContainerUpdateRow[];
        return rows.map(rowToRecord);
    }

    /**
     * Stores a batch under the ids the agent gave them, in one transaction. Returns the ids
     * now stored (`storedIds`), a repeat among them, and the records this call wrote
     * (`inserted`) -- the ones the dashboards have to be told about.
     */
    static insertMany(
        updates: StoredContainerUpdate[],
        receivedAt: string,
    ): { storedIds: string[]; inserted: ContainerUpdateRecord[] } {
        const stmt = db.prepare(`
            INSERT INTO container_updates
                (id, client_id, occurred_at, received_at, container_name, container_id, image_ref,
                 from_image_ref, from_image_id, to_image_id, from_digest, to_digest, from_version,
                 to_version, trigger, result, error, correlation_id, project_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
        `);
        const insertedIds = new Set<string>();
        const insert = db.transaction((batch: StoredContainerUpdate[]) => {
            for (const u of batch) {
                const { changes } = stmt.run(
                    u.id,
                    u.clientId,
                    u.occurredAt,
                    receivedAt,
                    u.containerName,
                    u.containerId ?? null,
                    u.imageRef,
                    u.fromImageRef ?? null,
                    u.fromImageId ?? null,
                    u.toImageId ?? null,
                    u.fromDigest ?? null,
                    u.toDigest ?? null,
                    u.fromVersion ?? null,
                    u.toVersion ?? null,
                    u.trigger,
                    u.result,
                    u.error ?? null,
                    u.correlationId ?? null,
                    u.projectIds.length > 0 ? JSON.stringify(u.projectIds) : null,
                );
                if (changes > 0) insertedIds.add(u.id);
            }
        });
        insert(updates);

        const storedIds = [...new Set(updates.map((u) => u.id))];
        if (insertedIds.size === 0) return { storedIds, inserted: [] };
        const rows = db
            .prepare(
                "SELECT * FROM container_updates WHERE id IN (SELECT value FROM json_each(?)) ORDER BY occurred_at DESC",
            )
            .all(JSON.stringify([...insertedIds])) as ContainerUpdateRow[];
        return { storedIds, inserted: rows.map(rowToRecord) };
    }

    /**
     * Removes updates older than `ttlDays` while keeping at least `minKeep` of the most recent
     * ones -- the activity's rule. Age is when the update happened, not when it was reported.
     */
    static cleanupOld(ttlDays: number, minKeep: number): number {
        const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
        const anchor = db
            .prepare("SELECT occurred_at FROM container_updates ORDER BY occurred_at DESC LIMIT 1 OFFSET ?")
            .get(Math.max(0, minKeep - 1)) as { occurred_at: string } | undefined;

        let sql = "DELETE FROM container_updates WHERE occurred_at < ?";
        const params: string[] = [cutoff];
        if (anchor) {
            sql += " AND occurred_at < ?";
            params.push(anchor.occurred_at);
        }
        return db.prepare(sql).run(...params).changes;
    }
}
