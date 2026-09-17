import { randomUUID } from "crypto";
import db from "../core/Database.js";
import { Project, ProjectQuery, ProjectQuerySchema } from "@dim/shared";
import { logger } from "@dim/shared/node";

/** A row of `projects` (migration 16). SQLite has no boolean, so `auto_update` is 0 or 1. */
interface ProjectRow {
    id: string;
    name: string;
    query: string;
    auto_update: number;
    cron: string | null;
    created_at: string;
}

function parseQuery(row: ProjectRow): ProjectQuery {
    try {
        const parsed = ProjectQuerySchema.safeParse(JSON.parse(row.query));
        if (parsed.success) return parsed.data;
    } catch {
        // Falls through to the empty query below.
    }
    // Only written through the schema, so this is damage, not a format to support. An empty
    // query matches nothing, which is the one reading that cannot update a wrong container.
    logger.error({ projectId: row.id }, "Stored project query does not parse");
    return [];
}

function rowToProject(row: ProjectRow): Project {
    return {
        id: row.id,
        name: row.name,
        query: parseQuery(row),
        autoUpdate: row.auto_update === 1,
        cron: row.cron,
        createdAt: row.created_at,
    };
}

export interface ProjectChanges {
    name?: string;
    query?: ProjectQuery;
    autoUpdate?: boolean;
    cron?: string | null;
}

export class ProjectRepository {
    /** Ordered by creation, which is also the order a container claimed twice is resolved in. */
    static list(): Project[] {
        const rows = db
            .prepare("SELECT * FROM projects ORDER BY created_at, id")
            .all() as ProjectRow[];
        return rows.map(rowToProject);
    }

    static findById(id: string): Project | null {
        const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
            | ProjectRow
            | undefined;
        return row ? rowToProject(row) : null;
    }

    static nameTaken(name: string, exceptId?: string): boolean {
        const row = db
            .prepare("SELECT id FROM projects WHERE name = ? AND id != ?")
            .get(name, exceptId ?? "") as { id: string } | undefined;
        return row !== undefined;
    }

    static add(project: {
        name: string;
        query: ProjectQuery;
        autoUpdate: boolean;
        cron: string | null;
    }): Project {
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        db.prepare(
            `INSERT INTO projects (id, name, query, auto_update, cron, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
            id,
            project.name,
            JSON.stringify(project.query),
            project.autoUpdate ? 1 : 0,
            project.cron,
            createdAt,
        );
        return { id, ...project, createdAt };
    }

    /**
     * Writes the fields that are present. `cron: null` is a value of its own ("inherit"),
     * so the caller passes `undefined` for "leave as it is".
     */
    static update(id: string, changes: ProjectChanges): Project | null {
        const sets: string[] = [];
        const values: Array<string | number | null> = [];
        if (changes.name !== undefined) {
            sets.push("name = ?");
            values.push(changes.name);
        }
        if (changes.query !== undefined) {
            sets.push("query = ?");
            values.push(JSON.stringify(changes.query));
        }
        if (changes.autoUpdate !== undefined) {
            sets.push("auto_update = ?");
            values.push(changes.autoUpdate ? 1 : 0);
        }
        if (changes.cron !== undefined) {
            sets.push("cron = ?");
            values.push(changes.cron);
        }
        if (sets.length === 0) return this.findById(id);

        const result = db
            .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
            .run(...values, id);
        if (result.changes === 0) return null;
        return this.findById(id);
    }

    static remove(id: string): boolean {
        const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
        return result.changes > 0;
    }
}
