import db from "../core/Database.js";
import { Project } from "@dim/shared";

/** A row of `projects` (migration 11). SQLite has no boolean, so `auto_update` is 0 or 1. */
interface ProjectRow {
    name: string;
    auto_update: number;
    cron: string | null;
    created_at: string;
}

function rowToProject(row: ProjectRow): Project {
    return {
        name: row.name,
        autoUpdate: row.auto_update === 1,
        cron: row.cron,
        createdAt: row.created_at,
    };
}

export class ProjectRepository {
    static list(): Project[] {
        const rows = db
            .prepare("SELECT * FROM projects ORDER BY name")
            .all() as ProjectRow[];
        return rows.map(rowToProject);
    }

    static findByName(name: string): Project | null {
        const row = db
            .prepare("SELECT * FROM projects WHERE name = ?")
            .get(name) as ProjectRow | undefined;
        return row ? rowToProject(row) : null;
    }

    /**
     * Adds the project. Returns null when the name is already taken -- the caller turns
     * that into a 409 rather than silently adopting the existing settings.
     */
    static add(name: string, autoUpdate: boolean, cron: string | null): Project | null {
        const createdAt = new Date().toISOString();
        const result = db
            .prepare(
                `INSERT INTO projects (name, auto_update, cron, created_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(name) DO NOTHING`,
            )
            .run(name, autoUpdate ? 1 : 0, cron, createdAt);
        if (result.changes === 0) return null;
        return { name, autoUpdate, cron, createdAt };
    }

    /**
     * Writes the fields that are present. `cron: null` is a value of its own ("inherit"),
     * so the caller passes `undefined` for "leave as it is".
     */
    static update(
        name: string,
        changes: { autoUpdate?: boolean; cron?: string | null },
    ): Project | null {
        const sets: string[] = [];
        const values: Array<string | number | null> = [];
        if (changes.autoUpdate !== undefined) {
            sets.push("auto_update = ?");
            values.push(changes.autoUpdate ? 1 : 0);
        }
        if (changes.cron !== undefined) {
            sets.push("cron = ?");
            values.push(changes.cron);
        }
        if (sets.length === 0) return this.findByName(name);

        const result = db
            .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE name = ?`)
            .run(...values, name);
        if (result.changes === 0) return null;
        return this.findByName(name);
    }

    static remove(name: string): boolean {
        const result = db.prepare("DELETE FROM projects WHERE name = ?").run(name);
        return result.changes > 0;
    }
}
