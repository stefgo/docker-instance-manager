import db from "../core/Database.js";

export class UserRepository {
    static countAll(): number {
        const result = db
            .prepare("SELECT COUNT(*) as count FROM users")
            .get() as { count: number };
        return result.count;
    }

    static findAll(): any[] {
        return db
            .prepare(
                "SELECT id, username, auth_methods, created_at, updated_at FROM users",
            )
            .all() as any[];
    }

    static findByUsername(username: string): any {
        return db
            .prepare("SELECT * FROM users WHERE username = ?")
            .get(username) as any;
    }

    static findById(id: string): any {
        return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    }

    static create(
        username: string,
        passwordHash: string | null,
        authMethods: string,
    ): void {
        db.prepare(
            "INSERT INTO users (username, password_hash, auth_methods) VALUES (?, ?, ?)",
        ).run(username, passwordHash, authMethods);
    }

    static updatePassword(id: string, passwordHash: string): void {
        db.prepare(
            "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(passwordHash, id);
    }

    static updateAuthMethods(id: string, authMethods: string): void {
        db.prepare(
            "UPDATE users SET auth_methods = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(authMethods, id);
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
}
