import type { MigrationContext } from "./context.js";

/**
 * Update checks are answered per platform and per local image. The same tag names a
 * different image on every platform, and whether the registry holds something newer for
 * that platform can only be said about the index the local image was pulled from -- so the
 * stored verdict is keyed by all three and read back only for an image that matches.
 *
 * `platform` is `os/architecture`, or empty for an agent that does not report it;
 * `local_digest` is empty for an image without a repoDigest. The old rows are dropped:
 * the table is a cache the next sweep fills again.
 */
export const migration17 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          DROP TABLE IF EXISTS image_update_checks;
          CREATE TABLE image_update_checks (
            image_ref     TEXT NOT NULL,
            platform      TEXT NOT NULL DEFAULT '',
            local_digest  TEXT NOT NULL DEFAULT '',
            has_update    INTEGER NOT NULL,
            remote_digest TEXT,
            checked_at    TEXT NOT NULL,
            error         TEXT,
            PRIMARY KEY (image_ref, platform, local_digest)
          );
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          DROP TABLE IF EXISTS image_update_checks;
          CREATE TABLE image_update_checks (
            image_ref     TEXT PRIMARY KEY,
            remote_digest TEXT,
            checked_at    TEXT NOT NULL,
            error         TEXT
          );
        `);
    },
};
