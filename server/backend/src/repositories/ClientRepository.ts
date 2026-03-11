import db from "../core/Database.js";

export class ClientRepository {
    static findAll(): any[] {
        return db.prepare("SELECT * FROM clients").all() as any[];
    }

    static findByToken(token: string): any {
        return db
            .prepare("SELECT id, allowed_ip FROM clients WHERE auth_token = ?")
            .get(token) as any;
    }

    static upsert(
        id: string,
        hostname: string,
        authToken: string,
        allowedIp: string,
    ): void {
        const stmt = db.prepare(`
            INSERT INTO clients (id, hostname, auth_token, allowed_ip, last_seen) 
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                hostname = excluded.hostname,
                auth_token = excluded.auth_token,
                allowed_ip = excluded.allowed_ip,
                updated_at = datetime('now')
        `);
        stmt.run(id, hostname, authToken, allowedIp);
    }

    static updateDisplayName(
        id: string,
        displayName: string,
    ): { changes: number } {
        return db
            .prepare("UPDATE clients SET display_name = ? WHERE id = ?")
            .run(displayName, id);
    }

    static updateAuthSuccess(
        id: string,
        ipAddress: string,
        version: string | null,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, ip_address=?, version=? WHERE id=?",
        ).run(now, now, ipAddress, version, id);
    }

    static updateLastSeen(id: string): void {
        const now = new Date().toISOString();
        db.prepare("UPDATE clients SET updated_at=? WHERE id = ?").run(now, id);
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    }
}
