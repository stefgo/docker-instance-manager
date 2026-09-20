import type { MigrationContext } from "./context.js";

export const migration07 = {
    up: async ({ context: db }: MigrationContext) => {
        // Migration 06 named the column after where the value came from: the address the
        // agent registered from. From now on it is editable in the client editor, may be a
        // network, and may be null to switch the check off -- a decision, not an
        // observation. `inbound_allowed_ip` says what the value does.
        db.exec(
            `ALTER TABLE clients RENAME COLUMN inbound_registered_ip TO inbound_allowed_ip;`,
        );
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(
            `ALTER TABLE clients RENAME COLUMN inbound_allowed_ip TO inbound_registered_ip;`,
        );
    },
};
