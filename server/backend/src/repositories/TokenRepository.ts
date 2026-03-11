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
}
