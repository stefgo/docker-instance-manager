/**
 * Drops the manual auto-update list. Its entries are not carried over: they name single
 * containers, and the only thing left to enrol them with is their Compose stack -- which
 * holds more containers than were ever on the list. Widening the set of containers that
 * update themselves is not a migration's decision to make.
 *
 * `down` recreates the table empty, for the same reason.
 */
export const migration12 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS container_auto_update_manual;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS container_auto_update_manual (
            container_name TEXT NOT NULL,
            client_id      TEXT NOT NULL DEFAULT '',
            added_at       TEXT NOT NULL,
            PRIMARY KEY (container_name, client_id)
          );
        `);
    },
};
