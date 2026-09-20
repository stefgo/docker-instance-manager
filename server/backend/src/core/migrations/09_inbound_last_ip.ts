import type { MigrationContext } from "./context.js";

export const migration09 = {
    up: async ({ context: db }: MigrationContext) => {
        // The address an inbound agent last authenticated from. Migration 06 folded the old
        // `ip_address` column into `inbound_allowed_ip` and left nothing behind that records
        // where a client actually connects from -- so the client editor had no way to say
        // that an allowed address about to be saved would shut the agent out. Nothing
        // decides on this value; it exists to be shown next to the one that does.
        //
        // No backfill: the column fills itself on the next connect, and an invented value
        // would be exactly the wrong kind of evidence.
        db.exec(`ALTER TABLE clients ADD COLUMN inbound_last_ip TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients DROP COLUMN inbound_last_ip;`);
    },
};
