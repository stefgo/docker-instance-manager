import type { MigrationContext } from "./context.js";

/**
 * Auto-prune per host: the schedule it is set to (`null` while it is off, which every host
 * is until it is switched on), and when the agent last finished one and runs the next, as it
 * reports them (`AGENT_STATUS`). Nothing is backfilled -- a prune from the menu is no
 * auto-prune.
 */
export const migration31 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE clients ADD COLUMN auto_prune_cron TEXT;
            ALTER TABLE clients ADD COLUMN auto_prune_last_run TEXT;
            ALTER TABLE clients ADD COLUMN auto_prune_next_run TEXT;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE clients DROP COLUMN auto_prune_next_run;
            ALTER TABLE clients DROP COLUMN auto_prune_last_run;
            ALTER TABLE clients DROP COLUMN auto_prune_cron;
        `);
    },
};
