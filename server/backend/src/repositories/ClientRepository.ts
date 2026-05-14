import db from "../core/Database.js";

export class ClientRepository {
    static findAll(): any[] {
        return db.prepare("SELECT * FROM clients").all() as any[];
    }

    static findById(id: string): any {
        return db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as any;
    }

    static findByToken(token: string): any {
        return db
            .prepare("SELECT id, inbound_registered_ip FROM clients WHERE auth_token = ?")
            .get(token) as any;
    }

    static findOutboundClients(): any[] {
        return db
            .prepare("SELECT * FROM clients WHERE connection_mode = 'outbound'")
            .all() as any[];
    }

    static upsert(
        id: string,
        hostname: string,
        authToken: string,
        registeredIp: string,
    ): void {
        const stmt = db.prepare(`
            INSERT INTO clients (id, hostname, auth_token, inbound_registered_ip, last_seen)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                hostname = excluded.hostname,
                auth_token = excluded.auth_token,
                inbound_registered_ip = excluded.inbound_registered_ip,
                updated_at = datetime('now')
        `);
        stmt.run(id, hostname, authToken, registeredIp);
    }

    static createOutbound(
        id: string,
        hostname: string,
        outboundTargetAddress: string,
        authToken: string,
    ): void {
        db.prepare(`
            INSERT INTO clients (id, hostname, outbound_target_address, auth_token, connection_mode, last_seen)
            VALUES (?, ?, ?, ?, 'outbound', datetime('now'))
        `).run(id, hostname, outboundTargetAddress, authToken);
    }

    static updateDisplayName(
        id: string,
        displayName: string,
    ): { changes: number } {
        return db
            .prepare("UPDATE clients SET display_name = ? WHERE id = ?")
            .run(displayName, id);
    }

    static updateAuthToken(id: string, authToken: string): void {
        db.prepare(
            "UPDATE clients SET auth_token = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(authToken, id);
    }

    static updateAuthSuccess(id: string, version: string | null): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, version=? WHERE id=?",
        ).run(now, now, version, id);
    }

    static updateLastSeen(id: string): void {
        const now = new Date().toISOString();
        db.prepare("UPDATE clients SET updated_at=? WHERE id = ?").run(now, id);
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    }
}
