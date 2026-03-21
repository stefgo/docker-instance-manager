import db from "../core/Database.js";
import {
    DockerState,
    DockerContainer,
    DockerImage,
    DockerVolume,
    DockerNetwork,
} from "@docker-instance-manager/shared";

export class DockerStateRepository {
    static upsert(clientId: string, state: Omit<DockerState, "updatedAt">): void {
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO docker_state (client_id, containers, images, volumes, networks, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                containers = excluded.containers,
                images     = excluded.images,
                volumes    = excluded.volumes,
                networks   = excluded.networks,
                updated_at = excluded.updated_at
        `).run(
            clientId,
            JSON.stringify(state.containers),
            JSON.stringify(state.images),
            JSON.stringify(state.volumes),
            JSON.stringify(state.networks),
            now,
        );
    }

    static findByClientId(clientId: string): DockerState | null {
        const row = db.prepare(
            "SELECT * FROM docker_state WHERE client_id = ?",
        ).get(clientId) as any;

        if (!row) return null;

        return {
            containers: JSON.parse(row.containers) as DockerContainer[],
            images: JSON.parse(row.images) as DockerImage[],
            volumes: JSON.parse(row.volumes) as DockerVolume[],
            networks: JSON.parse(row.networks) as DockerNetwork[],
            updatedAt: row.updated_at,
        };
    }

    static deleteByClientId(clientId: string): void {
        db.prepare("DELETE FROM docker_state WHERE client_id = ?").run(clientId);
    }
}
