import crypto from "crypto";
import db from "../core/Database.js";
import { type AutoUpdateScheduleRun, type ConnectionMode, AutoUpdateScheduleRunSchema } from "@dim/shared";
import { decryptSecret, encryptSecret } from "../services/SecretCrypto.js";

/**
 * How a token the server only has to recognise is stored: an inbound agent's auth token and
 * a registration token alike. The value itself is shown once; the table holds its SHA-256.
 */
export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A row of the `clients` table as migrations 06 and 07 leave it. Deliberately not the shared
 * `Client` type: that one is camelCase and derived from Zod, these are the raw snake_case
 * columns, and ProxyService does the mapping between them.
 */
export interface ClientRow {
    id: string;
    hostname: string | null;
    display_name: string | null;
    /**
     * Never the token itself (migration 25). Inbound: its SHA-256 hash, because the server
     * only has to recognise the token an agent presents. Outbound: encrypted with
     * SecretCrypto, because the server presents it itself when it dials -- read it with
     * outboundAuthToken().
     */
    auth_token: string | null;
    connection_mode: ConnectionMode;
    /**
     * Inbound clients only: the address or IPv4 network their connections must come from.
     * Starts out as the address the agent registered from; null means the check is off.
     */
    inbound_allowed_ip: string | null;
    /** Outbound clients only: the host:port the server dials. */
    outbound_target_address: string | null;
    /**
     * Inbound clients only: the address the agent last authenticated from. Nothing decides
     * on it -- it is written after the allowed-address check has passed, so it is always an
     * address that was let in, and it exists so the client editor can say what
     * `inbound_allowed_ip` is about to be measured against.
     */
    inbound_last_ip: string | null;
    version: string | null;
    /**
     * This host's auto-update schedule for containers that belong to no project (migration
     * 14). `null` inherits the default from the settings, `''` means the host takes part
     * through its projects only -- so null and the empty string are not the same value here.
     */
    auto_update_cron: string | null;
    /** The IANA time zone the agent reported on its last connect (migration 22). */
    timezone: string | null;
    /**
     * When the host last finished an auto-update run, on the agent's clock (migration 27).
     * Only ever moved forward -- see `updateAutoUpdateState`.
     */
    auto_update_last_run: string | null;
    /** The earliest run the host's schedules have planned, as the agent last reported it. */
    auto_update_next_run: string | null;
    /**
     * Every schedule the agent has planned, with its own next run (migration 29): a JSON
     * array of `AutoUpdateScheduleRun`, read with `autoUpdateSchedulesOf`. `null` until an
     * agent that reports them has done so.
     */
    auto_update_schedules: string | null;
    /** This host's auto-prune schedule (migration 31). `null` while auto-prune is off. */
    auto_prune_cron: string | null;
    /** When the host last finished an auto-prune, on the agent's clock. Only moved forward. */
    auto_prune_last_run: string | null;
    /** The next auto-prune the agent has planned, as it last reported it. */
    auto_prune_next_run: string | null;
    /**
     * Inbound clients only (migration 28): SHA-256 of the registration token issued for this
     * client, or null when none is open. Cleared by the registration that uses it.
     */
    registration_token_hash: string | null;
    /** Until when that token is valid, as ISO text. Kept after it expires, for the page. */
    registration_expires_at: string | null;
    last_seen: string | null;
    created_at: string;
    updated_at: string | null;
}

/**
 * The later of two times, or whichever of them is there. Compared as instants: the agent
 * writes UTC ISO strings, but the column must not move back on a value written another way.
 */
function laterOf(stored: string | null, reported: string | null): string | null {
    if (reported === null) return stored;
    if (stored === null) return reported;
    const storedTime = Date.parse(stored);
    const reportedTime = Date.parse(reported);
    if (Number.isNaN(reportedTime)) return stored;
    if (Number.isNaN(storedTime)) return reported;
    return reportedTime > storedTime ? reported : stored;
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

    /**
     * Resolves the identity an agent presents when it connects. Both halves have to match
     * the same row: the id alone is no secret -- it stands in every dashboard URL -- and the
     * token alone used to make a client whoever its token happened to belong to, so a token
     * copied to the wrong host took over that host's row. Narrower than the other finders,
     * because this runs on every agent connect.
     *
     * The stored value is a hash, so the comparison runs on the hash of what was presented.
     * An outbound client's encrypted token never matches -- it has no business connecting
     * inbound.
     */
    static findByIdAndToken(
        id: string,
        token: string,
    ): Pick<ClientRow, "id" | "inbound_allowed_ip" | "connection_mode"> | undefined {
        return db
            .prepare(
                "SELECT id, inbound_allowed_ip, connection_mode FROM clients WHERE id = ? AND auth_token = ?",
            )
            .get(id, hashToken(token)) as
            | Pick<ClientRow, "id" | "inbound_allowed_ip" | "connection_mode">
            | undefined;
    }

    static findOutboundClients(): ClientRow[] {
        return db
            .prepare("SELECT * FROM clients WHERE connection_mode = 'outbound'")
            .all() as ClientRow[];
    }

    /**
     * Creates an inbound client that waits for its agent: no hostname, no auth token and
     * never seen. The registration token is set separately, by setRegistrationToken. A
     * null `allowedIp` means the address the agent registers from becomes the allowed one.
     */
    static createPendingInbound(id: string, displayName: string, allowedIp: string | null): void {
        db.prepare(`
            INSERT INTO clients (id, display_name, inbound_allowed_ip, connection_mode)
            VALUES (?, ?, ?, 'inbound')
        `).run(id, displayName, allowedIp);
    }

    /**
     * Opens a registration for an inbound client, replacing a token that was still open.
     * Only the hash is stored. Restricted to inbound rows in SQL: an outbound agent is
     * registered by the server dialling it, never with a token.
     */
    static setRegistrationToken(id: string, token: string, expiresAt: string): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET registration_token_hash = ?, registration_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'inbound'",
            )
            .run(hashToken(token), expiresAt, id);
    }

    /**
     * The inbound client a registration token was issued for, while the token is valid.
     * The expiry goes through datetime(): it is written as ISO text, and compared as a
     * plain string with SQLite's own format the two disagree within the same day.
     */
    static findByValidRegistrationToken(
        token: string,
    ): Pick<ClientRow, "id" | "auth_token"> | undefined {
        return db
            .prepare(
                "SELECT id, auth_token FROM clients WHERE registration_token_hash = ? AND connection_mode = 'inbound' AND datetime(registration_expires_at) > datetime('now')",
            )
            .get(hashToken(token)) as Pick<ClientRow, "id" | "auth_token"> | undefined;
    }

    /**
     * Binds the agent that presented `token` to the client it was issued for: the hostname
     * it reported, the auth token the server issued for it, and the token cleared, so it
     * registers nothing a second time. Matched on the token in the same statement, so of two
     * agents racing with one token only the first gets the client.
     *
     * The allowed address is set at the first registration only, and only when the
     * operator gave none: then the address the agent registers from becomes it. A client
     * that registers anew keeps what the operator has set since -- including the check
     * switched off. In the SET clause every column still reads its old value.
     *
     * Returns false when the token was no longer valid.
     */
    static completeRegistration(
        id: string,
        token: string,
        hostname: string,
        authToken: string,
        registeringIp: string,
    ): boolean {
        const { changes } = db
            .prepare(`
                UPDATE clients SET
                    hostname = ?,
                    auth_token = ?,
                    inbound_allowed_ip = CASE
                        WHEN auth_token IS NULL THEN COALESCE(inbound_allowed_ip, ?)
                        ELSE inbound_allowed_ip
                    END,
                    registration_token_hash = NULL,
                    registration_expires_at = NULL,
                    last_seen = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                  AND connection_mode = 'inbound'
                  AND registration_token_hash = ?
                  AND datetime(registration_expires_at) > datetime('now')
            `)
            .run(hostname, hashToken(authToken), registeringIp, id, hashToken(token));
        return changes > 0;
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
        `).run(id, hostname, outboundTargetAddress, encryptSecret(authToken));
    }

    /**
     * The auth token the server presents to an outbound client, decrypted. Throws if it
     * cannot be decrypted (usually a changed secretKey).
     */
    static outboundAuthToken(client: ClientRow): string | null {
        return client.auth_token ? decryptSecret(client.auth_token) : null;
    }

    static updateDisplayName(
        id: string,
        displayName: string,
    ): { changes: number } {
        return db
            .prepare("UPDATE clients SET display_name = ? WHERE id = ?")
            .run(displayName, id);
    }

    /**
     * Changes where an inbound client's connections must come from; null switches the check
     * off. Restricted to inbound rows in SQL as well: an outbound client is dialled by the
     * server and never checked against an address.
     */
    static updateInboundAllowedIp(
        id: string,
        allowedIp: string | null,
    ): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET inbound_allowed_ip = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'inbound'",
            )
            .run(allowedIp, id);
    }

    /**
     * Changes where the server dials an outbound client. Restricted to outbound rows in SQL
     * as well, mirroring updateInboundAllowedIp: an inbound client is never dialled, so an
     * address stored on one would be a value nothing reads.
     */
    static updateOutboundTargetAddress(
        id: string,
        targetAddress: string,
    ): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET outbound_target_address = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'outbound'",
            )
            .run(targetAddress, id);
    }

    /**
     * Sets this host's own auto-update schedule. `null` puts it back on the default from
     * the settings; the empty string is a value of its own and is stored as such.
     */
    static updateAutoUpdateCron(id: string, cron: string | null): { changes: number } {
        return db
            .prepare(
                "UPDATE clients SET auto_update_cron = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .run(cron, id);
    }

    /** Sets this host's auto-prune schedule; `null` switches auto-prune off. */
    static updateAutoPruneCron(id: string, cron: string | null): { changes: number } {
        return db
            .prepare("UPDATE clients SET auto_prune_cron = ?, updated_at = datetime('now') WHERE id = ?")
            .run(cron, id);
    }

    /**
     * Stores where the host's auto-prune stands, as the agent reports it, and says whether
     * anything changed. Like the auto-update, the last run only ever moves forward and the
     * next run is taken as it comes.
     */
    static updateAutoPruneState(id: string, lastRun: string | null, nextRun: string | null): boolean {
        const row = db
            .prepare("SELECT auto_prune_last_run, auto_prune_next_run FROM clients WHERE id = ?")
            .get(id) as Pick<ClientRow, "auto_prune_last_run" | "auto_prune_next_run"> | undefined;
        if (!row) return false;
        const last = laterOf(row.auto_prune_last_run, lastRun);
        if (last === row.auto_prune_last_run && nextRun === row.auto_prune_next_run) return false;
        db.prepare("UPDATE clients SET auto_prune_last_run = ?, auto_prune_next_run = ? WHERE id = ?").run(
            last,
            nextRun,
            id,
        );
        return true;
    }

    /**
     * Stores the token of an outbound client that registered again, encrypted like the one
     * createOutbound stored. Restricted to outbound rows in SQL: an inbound token is a hash,
     * and writing an encrypted value there would lock its agent out.
     */
    static updateOutboundAuthToken(id: string, authToken: string): void {
        db.prepare(
            "UPDATE clients SET auth_token = ?, updated_at = datetime('now') WHERE id = ? AND connection_mode = 'outbound'",
        ).run(encryptSecret(authToken), id);
    }

    /**
     * `lastIp` is the address the agent connected from, and only an inbound agent has one:
     * in outbound mode the server is the calling party, so the caller passes null there.
     * COALESCE rather than a plain assignment, so null leaves the stored address alone
     * instead of erasing the one piece of evidence the client editor has.
     */
    static updateAuthSuccess(
        id: string,
        version: string | null,
        lastIp: string | null,
        timezone: string | null,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE clients SET last_seen=?, updated_at=?, version=?, timezone=?, inbound_last_ip=COALESCE(?, inbound_last_ip) WHERE id=?",
        ).run(now, now, version, timezone, lastIp, id);
    }

    /**
     * Called when a connection closes, so now is the last moment the agent was seen.
     * Without `last_seen` the field would keep the time the agent connected, and a client
     * that held the connection for a month would read "last seen 30 days ago" the second
     * it drops -- the one moment the field is actually looked at.
     */
    static updateLastSeen(id: string): void {
        const now = new Date().toISOString();
        db.prepare("UPDATE clients SET last_seen=?, updated_at=? WHERE id = ?").run(
            now,
            now,
            id,
        );
    }

    /**
     * Stores where the host's auto-update schedules stand, as its agent reports them.
     * Returns whether anything changed, so an unchanged report is not broadcast.
     *
     * The last run only ever moves forward. An agent whose state file was lost reports
     * `null` or an older run, and the run the server already knows of is still true; the
     * next run and the schedules are the agent's plan, so they are taken as they come -- an
     * agent that does not report the schedules leaves `null`, not the list of its predecessor.
     */
    static updateAutoUpdateState(
        id: string,
        lastRun: string | null,
        nextRun: string | null,
        schedules: AutoUpdateScheduleRun[] | null = null,
    ): boolean {
        const row = db
            .prepare("SELECT auto_update_last_run, auto_update_next_run, auto_update_schedules FROM clients WHERE id = ?")
            .get(id) as
            | Pick<ClientRow, "auto_update_last_run" | "auto_update_next_run" | "auto_update_schedules">
            | undefined;
        if (!row) return false;
        const last = laterOf(row.auto_update_last_run, lastRun);
        const plans = schedules ? JSON.stringify(schedules) : null;
        if (
            last === row.auto_update_last_run &&
            nextRun === row.auto_update_next_run &&
            plans === row.auto_update_schedules
        ) {
            return false;
        }
        db.prepare(
            "UPDATE clients SET auto_update_last_run = ?, auto_update_next_run = ?, auto_update_schedules = ? WHERE id = ?",
        ).run(last, nextRun, plans, id);
        return true;
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    }
}

/**
 * The schedules a row holds, or `null` for none. A stored value that does not read as the
 * list counts as none: it would otherwise refuse the whole client list in every browser.
 */
export function autoUpdateSchedulesOf(row: Pick<ClientRow, "auto_update_schedules">): AutoUpdateScheduleRun[] | null {
    if (!row.auto_update_schedules) return null;
    try {
        const parsed = AutoUpdateScheduleRunSchema.array().safeParse(JSON.parse(row.auto_update_schedules));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
