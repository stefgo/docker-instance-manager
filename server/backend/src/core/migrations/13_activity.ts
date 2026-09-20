import type { MigrationContext } from "./context.js";

/**
 * Replaces the notification list with activity events.
 *
 * Nothing is carried over. A notification is a sentence the server wrote after comparing
 * two snapshots; an event is a structured fact its originator reported. There is no way to
 * read `kind`, `level`, a subject and a correlation out of a finished sentence, so a
 * migrated row would be an entry the new list cannot filter, group or phrase.
 *
 * Two timestamps: `occurred_at` is the originator's clock and orders the list,
 * `received_at` is the server's and is what tells a late arrival from a recent event.
 */
export const migration13 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE activity (
            id             TEXT PRIMARY KEY,
            source         TEXT NOT NULL,
            client_id      TEXT,
            kind           TEXT NOT NULL,
            level          TEXT NOT NULL,
            correlation_id TEXT,
            subject        TEXT,
            data           TEXT,
            occurred_at    TEXT NOT NULL,
            received_at    TEXT NOT NULL,
            seen_by        TEXT NOT NULL DEFAULT '[]'
          );
          CREATE INDEX activity_occurred ON activity (occurred_at DESC);
          CREATE INDEX activity_corr     ON activity (correlation_id);
          DROP TABLE IF EXISTS notifications;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          DROP TABLE IF EXISTS activity;
          CREATE TABLE IF NOT EXISTS notifications (
            id         TEXT PRIMARY KEY,
            level      TEXT NOT NULL,
            message    TEXT NOT NULL,
            detail     TEXT,
            context    TEXT,
            steps      TEXT,
            created_at TEXT NOT NULL,
            seen_by    TEXT NOT NULL DEFAULT '[]'
          );
        `);
    },
};
