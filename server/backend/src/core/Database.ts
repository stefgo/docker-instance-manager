import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Assuming process.cwd() is project root or server root.
// If run from workspace root: server/data
// If run from server dir: data
// Let's make it robust: relative to this file
import { fileURLToPath } from "url";
import { logger } from "@dim/shared/node";
import { Umzug } from "umzug";
import { migration00 } from "./migrations/00_initial.js";
import { migration01 } from "./migrations/01_docker_state.js";
import { migration02 } from "./migrations/02_image_update_checks.js";
import { migration03 } from "./migrations/03_image_update_checks_drop_columns.js";
import { migration04 } from "./migrations/04_container_auto_update.js";
import { migration05 } from "./migrations/05_notifications.js";
import { migration06 } from "./migrations/06_connection_mode.js";
import { migration07 } from "./migrations/07_rename_inbound_allowed_ip.js";
import { migration08 } from "./migrations/08_token_registration_defaults.js";
import { migration09 } from "./migrations/09_inbound_last_ip.js";
import { migration10 } from "./migrations/10_notification_steps.js";
import { migration11 } from "./migrations/11_projects.js";
import { migration12 } from "./migrations/12_drop_manual_auto_update.js";
import { migration13 } from "./migrations/13_activity.js";
import { migration14 } from "./migrations/14_client_auto_update_cron.js";
import { migration15 } from "./migrations/15_activity_trace_level.js";
import { migration16 } from "./migrations/16_project_queries.js";
import { migration17 } from "./migrations/17_image_update_checks_platform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/core -> server/data
const DATA_DIR = path.resolve(__dirname, "../../data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, "server.db");
const db = new Database(dbPath);
logger.info(`Database opened: ${dbPath}`);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// Run umzug migrations
const migrator = new Umzug<Database.Database>({
    migrations: [
        { name: "00_initial", up: migration00.up, down: migration00.down },
        { name: "01_docker_state", up: migration01.up, down: migration01.down },
        { name: "02_image_update_checks", up: migration02.up, down: migration02.down },
        { name: "03_image_update_checks_drop_columns", up: migration03.up, down: migration03.down },
        { name: "04_container_auto_update", up: migration04.up, down: migration04.down },
        { name: "05_notifications", up: migration05.up, down: migration05.down },
        { name: "06_connection_mode", up: migration06.up, down: migration06.down },
        { name: "07_rename_inbound_allowed_ip", up: migration07.up, down: migration07.down },
        { name: "08_token_registration_defaults", up: migration08.up, down: migration08.down },
        { name: "09_inbound_last_ip", up: migration09.up, down: migration09.down },
        { name: "10_notification_steps", up: migration10.up, down: migration10.down },
        { name: "11_projects", up: migration11.up, down: migration11.down },
        { name: "12_drop_manual_auto_update", up: migration12.up, down: migration12.down },
        { name: "13_activity", up: migration13.up, down: migration13.down },
        { name: "14_client_auto_update_cron", up: migration14.up, down: migration14.down },
        { name: "15_activity_trace_level", up: migration15.up, down: migration15.down },
        { name: "16_project_queries", up: migration16.up, down: migration16.down },
        { name: "17_image_update_checks_platform", up: migration17.up, down: migration17.down },
    ],
    context: db,
    storage: {
        async executed({ context }) {
            context.exec(
                `CREATE TABLE IF NOT EXISTS umzug_migrations (name TEXT PRIMARY KEY)`,
            );
            return (
                context
                    .prepare("SELECT name FROM umzug_migrations")
                    .all() as { name: string }[]
            ).map((r) => r.name);
        },
        async logMigration({ name, context }) {
            context
                .prepare("INSERT INTO umzug_migrations (name) VALUES (?)")
                .run(name);
        },
        async unlogMigration({ name, context }) {
            context
                .prepare("DELETE FROM umzug_migrations WHERE name = ?")
                .run(name);
        },
    },
    logger: console,
});

export async function initDatabase() {
    try {
        await migrator.up();
        logger.info("Database migrations executed successfully.");
    } catch (e) {
        logger.error({ err: e }, "Failed to run database migrations");
        throw e; // Rethrow to allow app to fail fast
    }
}

export default db;
