import type { MigrationContext } from "./context.js";

export const migration08 = {
    up: async ({ context: db }: MigrationContext) => {
        // What an agent cannot tell the server about itself. A registering agent sends its
        // hostname and nothing else, so the display name stayed empty and the allowed
        // address was whatever address the agent happened to arrive from -- both were
        // corrected by hand afterwards, if at all. The operator who issues the token knows
        // both, so the token carries them.
        //
        // Nullable, and read as "no default given": tokens issued before this migration
        // keep behaving exactly as they did.
        db.exec(`ALTER TABLE registration_tokens ADD COLUMN display_name TEXT;`);
        db.exec(`ALTER TABLE registration_tokens ADD COLUMN allowed_ip TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE registration_tokens DROP COLUMN allowed_ip;`);
        db.exec(`ALTER TABLE registration_tokens DROP COLUMN display_name;`);
    },
};
