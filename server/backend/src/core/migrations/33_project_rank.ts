import type { MigrationContext } from "./context.js";

/**
 * Replaces the switch of migration 32 by a rank: a project that excluded the containers of
 * other projects becomes rank 1, every other one stays at 0, so nothing changes hands.
 */
export const migration33 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE projects ADD COLUMN rank INTEGER NOT NULL DEFAULT 0;
            UPDATE projects SET rank = exclude_assigned;
            ALTER TABLE projects DROP COLUMN exclude_assigned;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE projects ADD COLUMN exclude_assigned INTEGER NOT NULL DEFAULT 0;
            UPDATE projects SET exclude_assigned = CASE WHEN rank > 0 THEN 1 ELSE 0 END;
            ALTER TABLE projects DROP COLUMN rank;
        `);
    },
};
