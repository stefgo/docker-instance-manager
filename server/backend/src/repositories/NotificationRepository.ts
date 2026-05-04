import { randomUUID } from "crypto";
import db from "../core/Database.js";
import { Notification, NotificationContext, NotificationLevel } from "@dim/shared";

interface NotificationRow {
    id: string;
    level: string;
    message: string;
    detail: string | null;
    context: string | null;
    created_at: string;
    seen_by: string;
}

function rowToNotification(row: NotificationRow): Notification {
    return {
        id: row.id,
        level: row.level as NotificationLevel,
        message: row.message,
        detail: row.detail ?? undefined,
        context: row.context ? JSON.parse(row.context) : undefined,
        createdAt: row.created_at,
        seenBy: JSON.parse(row.seen_by),
    };
}

export class NotificationRepository {
    static list(): Notification[] {
        const rows = db.prepare(
            "SELECT * FROM notifications ORDER BY created_at DESC",
        ).all() as NotificationRow[];
        return rows.map(rowToNotification);
    }

    static create(
        level: NotificationLevel,
        message: string,
        detail?: string,
        context?: NotificationContext,
    ): Notification {
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO notifications (id, level, message, detail, context, created_at, seen_by)
            VALUES (?, ?, ?, ?, ?, ?, '[]')
        `).run(id, level, message, detail ?? null, context ? JSON.stringify(context) : null, now);
        return {
            id,
            level,
            message,
            detail,
            context,
            createdAt: now,
            seenBy: [],
        };
    }

    static markSeen(id: string, userId: string): boolean {
        const row = db.prepare("SELECT seen_by FROM notifications WHERE id = ?").get(id) as { seen_by: string } | undefined;
        if (!row) return false;
        const seenBy: string[] = JSON.parse(row.seen_by);
        if (seenBy.includes(userId)) return true;
        seenBy.push(userId);
        db.prepare("UPDATE notifications SET seen_by = ? WHERE id = ?").run(JSON.stringify(seenBy), id);
        return true;
    }

    static markAllSeen(userId: string): void {
        const rows = db.prepare("SELECT id, seen_by FROM notifications").all() as { id: string; seen_by: string }[];
        const stmt = db.prepare("UPDATE notifications SET seen_by = ? WHERE id = ?");
        const update = db.transaction(() => {
            for (const row of rows) {
                const seenBy: string[] = JSON.parse(row.seen_by);
                if (!seenBy.includes(userId)) {
                    seenBy.push(userId);
                    stmt.run(JSON.stringify(seenBy), row.id);
                }
            }
        });
        update();
    }

    static delete(id: string): boolean {
        const info = db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
        return info.changes > 0;
    }

    static deleteAll(): void {
        db.prepare("DELETE FROM notifications").run();
    }

    static count(): number {
        const row = db.prepare("SELECT COUNT(*) as c FROM notifications").get() as { c: number };
        return row.c;
    }

    /**
     * Removes notifications older than ttlDays, while keeping at least minKeep
     * of the most-recent ones. Returns the number of deleted rows.
     */
    static cleanupOld(ttlDays: number, minKeep: number): number {
        const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();

        // Determine the created_at of the minKeep-th newest notification
        const anchor = db.prepare(
            "SELECT created_at FROM notifications ORDER BY created_at DESC LIMIT 1 OFFSET ?",
        ).get(Math.max(0, minKeep - 1)) as { created_at: string } | undefined;

        let sql = "DELETE FROM notifications WHERE created_at < ?";
        const params: string[] = [cutoff];

        if (anchor) {
            // Never delete anything newer than the minKeep boundary
            sql += " AND created_at < ?";
            params.push(anchor.created_at);
        }

        const info = db.prepare(sql).run(...params);
        return info.changes;
    }
}
