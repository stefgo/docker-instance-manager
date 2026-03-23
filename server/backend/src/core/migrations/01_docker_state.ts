export const migration01 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS docker_state (
            client_id   TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
            containers  TEXT NOT NULL DEFAULT '[]',
            images      TEXT NOT NULL DEFAULT '[]',
            volumes     TEXT NOT NULL DEFAULT '[]',
            networks    TEXT NOT NULL DEFAULT '[]',
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS docker_state;`);
    },
};
