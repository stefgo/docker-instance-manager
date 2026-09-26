import type { MigrationContext } from "./context.js";

/**
 * The IANA time zone the agent reports on connect. The agent plans the cron expressions of
 * its auto-update policy in that zone, so the dashboard shows it next to them.
 *
 * No backfill: an existing host has `NULL` until its agent next connects, and stays there if
 * the agent predates the field.
 */
export const migration22 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients ADD COLUMN timezone TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients DROP COLUMN timezone;`);
    },
};
