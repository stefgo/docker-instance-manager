export const migration04 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE container_auto_update_manual (
            container_name TEXT NOT NULL,
            client_id      TEXT NOT NULL DEFAULT '',
            added_at       TEXT NOT NULL,
            PRIMARY KEY (container_name, client_id)
          );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`DROP TABLE IF EXISTS container_auto_update_manual;`);
    },
};
