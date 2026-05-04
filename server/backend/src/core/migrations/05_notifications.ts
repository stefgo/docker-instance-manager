export const migration05 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE notifications (
            id         TEXT PRIMARY KEY,
            level      TEXT NOT NULL,
            message    TEXT NOT NULL,
            detail     TEXT,
            context    TEXT,
            created_at TEXT NOT NULL,
            seen_by    TEXT NOT NULL DEFAULT '[]'
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS notifications;`);
    },
};
