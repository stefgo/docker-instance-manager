import db from "../core/Database.js";

export interface ManualAutoUpdateEntry {
    containerName: string;
    clientId: string;   // '' = global (all clients)
    addedAt: string;
}

export class ContainerAutoUpdateRepository {
    static list(): ManualAutoUpdateEntry[] {
        const rows = db
            .prepare(
                "SELECT container_name, client_id, added_at FROM container_auto_update_manual ORDER BY added_at DESC",
            )
            .all() as Array<{ container_name: string; client_id: string; added_at: string }>;
        return rows.map((r) => ({
            containerName: r.container_name,
            clientId: r.client_id,
            addedAt: r.added_at,
        }));
    }

    static isEnrolled(containerName: string, clientId: string): boolean {
        const row = db
            .prepare(
                "SELECT 1 FROM container_auto_update_manual WHERE container_name = ? AND (client_id = ? OR client_id = '')",
            )
            .get(containerName, clientId);
        return !!row;
    }

    static addGlobal(containerName: string): void {
        db.transaction(() => {
            db.prepare(
                "DELETE FROM container_auto_update_manual WHERE container_name = ? AND client_id != ''",
            ).run(containerName);
            db.prepare(
                `INSERT INTO container_auto_update_manual (container_name, client_id, added_at)
                 VALUES (?, '', ?)
                 ON CONFLICT(container_name, client_id) DO NOTHING`,
            ).run(containerName, new Date().toISOString());
        })();
    }

    static addClient(containerName: string, clientId: string): void {
        const hasGlobal = db
            .prepare(
                "SELECT 1 FROM container_auto_update_manual WHERE container_name = ? AND client_id = ''",
            )
            .get(containerName);
        if (hasGlobal) return;
        db.prepare(
            `INSERT INTO container_auto_update_manual (container_name, client_id, added_at)
             VALUES (?, ?, ?)
             ON CONFLICT(container_name, client_id) DO NOTHING`,
        ).run(containerName, clientId, new Date().toISOString());
    }

    static removeGlobal(containerName: string): boolean {
        const result = db
            .prepare(
                "DELETE FROM container_auto_update_manual WHERE container_name = ? AND client_id = ''",
            )
            .run(containerName);
        return result.changes > 0;
    }

    static removeClient(containerName: string, clientId: string): boolean {
        const result = db
            .prepare(
                "DELETE FROM container_auto_update_manual WHERE container_name = ? AND client_id = ?",
            )
            .run(containerName, clientId);
        return result.changes > 0;
    }

    static removeAllForContainer(containerName: string): void {
        db.prepare(
            "DELETE FROM container_auto_update_manual WHERE container_name = ?",
        ).run(containerName);
    }

    static removeStaleForClient(clientId: string, currentNames: Set<string>): void {
        if (clientId === "") return;
        const existing = db
            .prepare(
                "SELECT container_name FROM container_auto_update_manual WHERE client_id = ?",
            )
            .all(clientId) as Array<{ container_name: string }>;
        for (const row of existing) {
            if (!currentNames.has(row.container_name)) {
                db.prepare(
                    "DELETE FROM container_auto_update_manual WHERE container_name = ? AND client_id = ?",
                ).run(row.container_name, clientId);
            }
        }
    }
}
