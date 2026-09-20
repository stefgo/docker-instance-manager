import type { MigrationContext } from "./context.js";

export const migration11 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE projects (
            name        TEXT PRIMARY KEY,
            auto_update INTEGER NOT NULL DEFAULT 0,
            cron        TEXT,
            created_at  TEXT NOT NULL
          );
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`DROP TABLE IF EXISTS projects;`);
    },
};
