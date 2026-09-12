export const migration10 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE notifications ADD COLUMN steps TEXT;`);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`ALTER TABLE notifications DROP COLUMN steps;`);
    },
};
