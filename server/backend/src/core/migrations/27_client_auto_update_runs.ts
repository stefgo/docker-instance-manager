import type { MigrationContext } from "./context.js";

/**
 * When a host last ran its auto-update and when it will next, as its agent reports them
 * (`AUTO_UPDATE_STATE`). The client list used to read the last run off the newest
 * `autoupdate.run` event -- but a run that changes nothing reports no event, and the
 * retention removes the ones that did, so the column was empty for most hosts.
 *
 * The last run is backfilled from those events, so a host shows what is known about it the
 * moment the server is updated, before its agent reports anything. Nothing is known about
 * the next run until the agent says so.
 */
export const migration27 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE clients ADD COLUMN auto_update_last_run TEXT;
            ALTER TABLE clients ADD COLUMN auto_update_next_run TEXT;

            UPDATE clients SET auto_update_last_run = (
                SELECT MAX(a.occurred_at) FROM activity a
                WHERE a.client_id = clients.id AND a.kind = 'autoupdate.run'
            );
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE clients DROP COLUMN auto_update_next_run;
            ALTER TABLE clients DROP COLUMN auto_update_last_run;
        `);
    },
};
