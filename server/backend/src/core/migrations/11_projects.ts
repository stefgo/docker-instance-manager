export const migration11 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE projects (
            name        TEXT PRIMARY KEY,
            auto_update INTEGER NOT NULL DEFAULT 0,
            cron        TEXT,
            created_at  TEXT NOT NULL
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS projects;`);
    },
};
