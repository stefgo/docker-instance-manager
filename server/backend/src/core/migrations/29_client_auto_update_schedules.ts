import type { MigrationContext } from "./context.js";

/**
 * Every auto-update schedule a host's agent has planned, each with its own next run, as JSON
 * (`AGENT_STATUS`). `auto_update_next_run` is the earliest of them and cannot say when a
 * particular container is next checked -- a container in a project runs on its project's
 * schedule, not on whichever comes first.
 *
 * Nothing is backfilled: only the agent knows its plan, and it reports it on its next connect.
 */
export const migration29 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients ADD COLUMN auto_update_schedules TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients DROP COLUMN auto_update_schedules;`);
    },
};
