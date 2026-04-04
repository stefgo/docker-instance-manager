export const migration03 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE image_update_checks DROP COLUMN has_update;`);
        db.exec(`ALTER TABLE image_update_checks DROP COLUMN local_digest;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE image_update_checks ADD COLUMN has_update INTEGER NOT NULL DEFAULT 0;`);
        db.exec(`ALTER TABLE image_update_checks ADD COLUMN local_digest TEXT;`);
    },
};
