export const migration00 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            hostname TEXT,
            display_name TEXT,
            auth_token TEXT UNIQUE,
            allowed_ip TEXT,
            ip_address TEXT,
            version TEXT,
            last_seen DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            auth_methods TEXT DEFAULT 'local',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS registration_tokens (
            token TEXT PRIMARY KEY,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            used_at DATETIME
          );

        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
          DROP TABLE IF EXISTS clients;
          DROP TABLE IF EXISTS users;
          DROP TABLE IF EXISTS registration_tokens;
        `);
    },
};
