/**
 * This host's own auto-update schedule, for everything on it that belongs to no project.
 *
 * Three states, and the column carries all three: `NULL` inherits the default from the
 * settings, an expression is this host's own, and `''` is the host saying it takes part
 * through its projects and nothing else. That is why the column is nullable and has no
 * default -- "not set" has to stay distinguishable from "set to nothing".
 *
 * No backfill: every existing host inherits, which is exactly what it did before the
 * column existed.
 */
export const migration14 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE clients ADD COLUMN auto_update_cron TEXT;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE clients DROP COLUMN auto_update_cron;`);
    },
};
