import type { MigrationContext } from "./context.js";

export const migration10 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE notifications ADD COLUMN steps TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE notifications DROP COLUMN steps;`);
    },
};
