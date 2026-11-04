import type { MigrationContext } from "./context.js";

/**
 * Whether a project leaves out the containers another project already has. Every existing
 * project keeps reading as before, so the column starts at 0.
 */
export const migration32 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE projects ADD COLUMN exclude_assigned INTEGER NOT NULL DEFAULT 0;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE projects DROP COLUMN exclude_assigned;`);
    },
};
