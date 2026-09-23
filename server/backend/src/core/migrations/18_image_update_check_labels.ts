import type { MigrationContext } from "./context.js";

/**
 * The OCI labels of the remote image an update would bring, as JSON text. NULL when they
 * were never fetched -- they are, only for an image with an update. They belong to
 * `remote_digest`, which is not part of the key, so every write that brings another remote
 * digest drops them (see `DockerStateRepository.storeCheck`).
 */
export const migration18 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE image_update_checks ADD COLUMN remote_labels TEXT`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE image_update_checks_old (
            image_ref     TEXT NOT NULL,
            platform      TEXT NOT NULL DEFAULT '',
            local_digest  TEXT NOT NULL DEFAULT '',
            has_update    INTEGER NOT NULL,
            remote_digest TEXT,
            checked_at    TEXT NOT NULL,
            error         TEXT,
            PRIMARY KEY (image_ref, platform, local_digest)
          );
          INSERT INTO image_update_checks_old
            (image_ref, platform, local_digest, has_update, remote_digest, checked_at, error)
            SELECT image_ref, platform, local_digest, has_update, remote_digest, checked_at, error
            FROM image_update_checks;
          DROP TABLE image_update_checks;
          ALTER TABLE image_update_checks_old RENAME TO image_update_checks;
        `);
    },
};
