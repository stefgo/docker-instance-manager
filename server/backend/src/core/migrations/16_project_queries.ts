/**
 * Projects are defined by a query instead of a Compose project name. The old rows are not
 * carried over: a name alone says nothing about which query the operator wants, so the
 * table is rebuilt empty and projects are created anew.
 */
export const migration16 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          DROP TABLE IF EXISTS projects;
          CREATE TABLE projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            query       TEXT NOT NULL,
            auto_update INTEGER NOT NULL DEFAULT 0,
            cron        TEXT,
            created_at  TEXT NOT NULL
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
          DROP TABLE IF EXISTS projects;
          CREATE TABLE projects (
            name        TEXT PRIMARY KEY,
            auto_update INTEGER NOT NULL DEFAULT 0,
            cron        TEXT,
            created_at  TEXT NOT NULL
          );
        `);
    },
};
