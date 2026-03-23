export const migration02 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS image_update_checks (
            image_ref     TEXT PRIMARY KEY,
            has_update    INTEGER NOT NULL,
            local_digest  TEXT,
            remote_digest TEXT,
            checked_at    TEXT NOT NULL,
            error         TEXT
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS image_update_checks;`);
    },
};
