import db from "../core/Database.js";
import {
    DockerState,
    DockerContainer,
    DockerImage,
    DockerImageUpdateCheck,
    DockerVolume,
    DockerNetwork,
} from "@docker-instance-manager/shared";

export class DockerStateRepository {
    static upsert(clientId: string, state: Omit<DockerState, "updatedAt">): void {
        const now = new Date().toISOString();

        // Preserve existing updateCheck fields – they are written by the update-check
        // endpoint and must not be lost when the client pushes a fresh Docker state.
        const existing = db.prepare(
            "SELECT images FROM docker_state WHERE client_id = ?",
        ).get(clientId) as { images: string } | undefined;

        let images = state.images;
        if (existing) {
            const existingImages: DockerImage[] = JSON.parse(existing.images);

            // Build lookup: tag → existing image (for digest comparison + updateCheck)
            const existingByTag = new Map<string, DockerImage>();
            for (const img of existingImages) {
                for (const tag of img.repoTags) {
                    existingByTag.set(tag, img);
                }
            }

            images = state.images.map((img) => {
                const existingImg = img.repoTags.map((t) => existingByTag.get(t)).find(Boolean);
                if (!existingImg?.updateCheck) return img;

                // If repoDigests changed the image was re-pulled → discard stale updateCheck
                const digestsChanged =
                    JSON.stringify([...img.repoDigests].sort()) !==
                    JSON.stringify([...existingImg.repoDigests].sort());
                if (digestsChanged) return img;

                return { ...img, updateCheck: existingImg.updateCheck };
            });
        }

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
            JSON.stringify(images),
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

    /**
     * Updates the updateCheck field on every image whose repoTags contain imageRef,
     * across all client docker states.
     */
    static updateImageCheckResult(imageRef: string, checkResult: DockerImageUpdateCheck): void {
        const rows = db.prepare("SELECT client_id, images FROM docker_state").all() as any[];

        for (const row of rows) {
            const images: DockerImage[] = JSON.parse(row.images);
            let changed = false;

            for (const image of images) {
                if (image.repoTags.includes(imageRef)) {
                    image.updateCheck = checkResult;
                    changed = true;
                }
            }

            if (changed) {
                db.prepare("UPDATE docker_state SET images = ? WHERE client_id = ?")
                    .run(JSON.stringify(images), row.client_id);
            }
        }
    }
}
