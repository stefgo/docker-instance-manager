import db from "../core/Database.js";
import type { ConnectionMode } from "@dim/shared";

/**
 * A row of the `clients` table as migration 06 leaves it. Deliberately not the shared
 * `Client` type: that one is camelCase and derived from Zod, these are the raw snake_case
 * columns, and ProxyService does the mapping between them.
 */
export interface ClientRow {
    id: string;
    hostname: string | null;
    display_name: string | null;
    auth_token: string | null;
    connection_mode: ConnectionMode;
    /** Inbound clients only: the address they registered from and are checked against. */
    inbound_registered_ip: string | null;
    /** Outbound clients only: the host:port the server dials. */
    outbound_target_address: string | null;
    version: string | null;
    last_seen: string | null;
    created_at: string;
    updated_at: string | null;
}

export class ClientRepository {
    static findAll(): ClientRow[] {
        return db.prepare("SELECT * FROM clients").all() as ClientRow[];
    }

    static findById(id: string): ClientRow | undefined {
        return db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as
            | ClientRow
            | undefined;
    }

    /** Narrower than the other finders: this runs on every agent connect. */
    static findByToken(
        token: string,
    ): Pick<ClientRow, "id" | "inbound_registered_ip"> | undefined {
        return db
            .prepare("SELECT id, inbound_registered_ip FROM clients WHERE auth_token = ?")
            .get(token) as Pick<ClientRow, "id" | "inbound_registered_ip"> | undefined;
    }

    static findOutboundClients(): ClientRow[] {
        return db
            .prepare("SELECT * FROM clients WHERE connection_mode = 'outbound'")
            .all() as ClientRow[];
    }

    /**
     * Creates an inbound client. A plain INSERT, deliberately: this used to be an upsert on
     * the id the agent sent, which let a caller holding a registration token name an
     * existing client and have its auth token replaced. The server picks the id now, so a
     * collision is a bug and should fail loudly.
     */
    static createInbound(
        id: string,
        hostname: string,
        authToken: string,
        registeredIp: string,
    ): void {
        db.prepare(`
            INSERT INTO clients (id, hostname, auth_token, inbound_registered_ip, connection_mode, last_seen)
            VALUES (?, ?, ?, ?, 'inbound', datetime('now'))
        `).run(id, hostname, authToken, registeredIp);
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
