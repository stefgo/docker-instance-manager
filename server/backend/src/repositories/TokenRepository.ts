import db from "../core/Database.js";

export class TokenRepository {
    static findAll(): any[] {
        return db
            .prepare(
                "SELECT * FROM registration_tokens ORDER BY created_at DESC",
            )
            .all() as any[];
    }

    static findValidByToken(token: string): any {
        return db
            .prepare(
                "SELECT * FROM registration_tokens WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')",
            )
            .get(token) as any;
    }

    static create(token: string, expiresAt: string): void {
        db.prepare(
            "INSERT INTO registration_tokens (token, expires_at) VALUES (?, ?)",
        ).run(token, expiresAt);
    }

    static markUsed(token: string): { changes: number } {
        return db
            .prepare(
                "UPDATE registration_tokens SET used_at = datetime('now') WHERE token = ?",
            )
            .run(token);
    }

    static delete(token: string): { changes: number } {
        return db
            .prepare("DELETE FROM registration_tokens WHERE token = ?")
            .run(token);
    }

    /**
     * Removes registration tokens that have become invalid (used or expired)
     * and whose invalidation timestamp is older than the given TTL in days.
     * Always retains the `minKeepCount` most recently invalidated tokens.
     *
     * An invalid token is considered invalidated at COALESCE(used_at, expires_at).
     */
    static cleanupInvalidTokens(ttlDays: number, minKeepCount: number): number {
        const days = Number.isFinite(ttlDays) && ttlDays >= 0 ? Math.floor(ttlDays) : 0;
        const keep = Number.isFinite(minKeepCount) && minKeepCount >= 0 ? Math.floor(minKeepCount) : 0;

        const result = db.prepare(`
            DELETE FROM registration_tokens
            WHERE (used_at IS NOT NULL OR expires_at <= datetime('now'))
              AND COALESCE(used_at, expires_at) < datetime('now', ?)
              AND token NOT IN (
                  SELECT token FROM registration_tokens
                  WHERE used_at IS NOT NULL OR expires_at <= datetime('now')
                  ORDER BY COALESCE(used_at, expires_at) DESC
                  LIMIT ?
              )
        `).run(`-${days} days`, keep);
        return result.changes;
    }
}
