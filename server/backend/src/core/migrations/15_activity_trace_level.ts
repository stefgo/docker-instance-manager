import type { MigrationContext } from "./context.js";

/**
 * Moves the connection events of agents to the new `trace` level.
 *
 * An agent connects and disconnects as a matter of routine, and at `info` / `warning` those
 * events buried everything else in the list. From now on the server records them as `trace`,
 * which the dashboard hides by default; this carries the events already stored along, so the
 * list does not keep showing them until they age out.
 *
 * The down migration cannot tell which level a row had before, so it restores the levels
 * the server used to record: `info` for a connect, `warning` for a disconnect.
 */
export const migration15 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          UPDATE activity SET level = 'trace'
          WHERE kind IN ('client.connected', 'client.disconnected');
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          UPDATE activity SET level = 'info'    WHERE kind = 'client.connected';
          UPDATE activity SET level = 'warning' WHERE kind = 'client.disconnected';
          UPDATE activity SET level = 'info'    WHERE level = 'trace';
        `);
    },
};
