export const migration06 = {
    up: async ({ context: db }: { context: any }) => {
        // All existing clients pre-migration were inbound-only (no connection_mode column existed).
        // ip_address was the original column name; allowed_ip was the authoritative registration value.
        db.exec(`
            CREATE TABLE clients_new (
                id TEXT PRIMARY KEY,
                hostname TEXT,
                display_name TEXT,
                auth_token TEXT UNIQUE,
                connection_mode TEXT NOT NULL DEFAULT 'inbound',
                inbound_registered_ip TEXT,
                outbound_target_address TEXT,
                version TEXT,
                last_seen DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO clients_new (id, hostname, display_name, auth_token, connection_mode, inbound_registered_ip, version, last_seen, created_at, updated_at)
                SELECT id, hostname, display_name, auth_token,
                    'inbound',
                    COALESCE(allowed_ip, ip_address),
                    version, last_seen, created_at, updated_at
                FROM clients;
            DROP TABLE clients;
            ALTER TABLE clients_new RENAME TO clients;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        // Restore the original schema from migration00: allowed_ip + ip_address, no connection_mode.
        db.exec(`
            CREATE TABLE clients_old (
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
            INSERT INTO clients_old (id, hostname, display_name, auth_token, allowed_ip, ip_address, version, last_seen, created_at, updated_at)
                SELECT id, hostname, display_name, auth_token,
                    inbound_registered_ip,
                    inbound_registered_ip,
                    version, last_seen, created_at, updated_at
                FROM clients;
            DROP TABLE clients;
            ALTER TABLE clients_old RENAME TO clients;
        `);
    },
};
