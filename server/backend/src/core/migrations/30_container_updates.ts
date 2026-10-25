import type { MigrationContext } from "./context.js";

/**
 * The container update history: one row per container that came up on another image, as its
 * agent reported it (`UPDATES`), and per update the agent tried that failed. Kept apart from
 * the activity, with a retention of its own -- an update is something to look back on long
 * after the log of the night it happened in has been cleared.
 *
 * Nothing is backfilled: the history begins with the first agent that reports updates.
 */
export const migration30 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            CREATE TABLE container_updates (
                id             TEXT PRIMARY KEY,
                client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                occurred_at    TEXT NOT NULL,
                received_at    TEXT NOT NULL,
                container_name TEXT NOT NULL,
                container_id   TEXT,
                image_ref      TEXT NOT NULL,
                from_image_ref TEXT,
                from_image_id  TEXT,
                to_image_id    TEXT,
                from_digest    TEXT,
                to_digest      TEXT,
                from_version   TEXT,
                to_version     TEXT,
                trigger        TEXT NOT NULL,
                result         TEXT NOT NULL,
                error          TEXT,
                correlation_id TEXT,
                project_ids    TEXT
            );
            CREATE INDEX idx_container_updates_occurred_at ON container_updates (occurred_at DESC);
            CREATE INDEX idx_container_updates_client_id ON container_updates (client_id);
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`DROP TABLE container_updates;`);
    },
};
