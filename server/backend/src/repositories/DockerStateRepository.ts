import db from "../core/Database.js";
import {
    DockerState,
    DockerContainer,
    DockerImage,
    DockerImageUpdateCheck,
    DockerVolume,
    DockerNetwork,
} from "@dim/shared";

export class DockerStateRepository {
    static upsert(clientId: string, state: Omit<DockerState, "updatedAt">): void {
        const now = new Date().toISOString();

        // Invalidate cached update-checks for images whose repoDigests changed
        // (i.e. the image was re-pulled and the check result is stale).
        const existing = db.prepare(
            "SELECT images FROM docker_state WHERE client_id = ?",
        ).get(clientId) as { images: string } | undefined;

        if (existing) {
            const existingImages: DockerImage[] = JSON.parse(existing.images);
            const existingDigestsByTag = new Map<string, string[]>();
            for (const img of existingImages) {
                for (const tag of img.repoTags) {
                    existingDigestsByTag.set(tag, img.repoDigests);
                }
            }

            for (const img of state.images) {
                const existingDigests = img.repoTags
                    .map((t) => existingDigestsByTag.get(t))
                    .find(Boolean);

                if (!existingDigests) continue;

                const toHashes = (digests: string[]) =>
                    [...digests].map((d) => d.split("@")[1] ?? d).sort();
                const digestsChanged =
                    JSON.stringify(toHashes(img.repoDigests)) !==
                    JSON.stringify(toHashes(existingDigests));

                if (digestsChanged) {
                    for (const tag of img.repoTags) {
                        db.prepare("DELETE FROM image_update_checks WHERE image_ref = ?").run(tag);
                    }
                }
            }
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

        const images: DockerImage[] = (JSON.parse(row.images) as DockerImage[]).map((img) => {
            for (const tag of img.repoTags) {
                const check = db.prepare(
                    "SELECT * FROM image_update_checks WHERE image_ref = ?",
                ).get(tag) as any;

                if (check) {
                    const refName = tag.split(":")[0];
                    const localDigestEntry = img.repoDigests.find((d) => d.startsWith(refName + "@"));
                    const localDigest = localDigestEntry ? localDigestEntry.split("@")[1] ?? null : null;
                    const remoteDigest: string | null = check.remote_digest ?? null;
                    const hasUpdate = localDigest !== null && remoteDigest !== null && localDigest !== remoteDigest;
                    return {
                        ...img,
                        updateCheck: {
                            hasUpdate,
                            remoteDigest,
                            checkedAt: check.checked_at,
                            ...(check.error ? { error: check.error } : {}),
                        } satisfies DockerImageUpdateCheck,
                    };
                }
            }
            return img;
        });

        return {
            containers: JSON.parse(row.containers) as DockerContainer[],
            images,
            volumes: JSON.parse(row.volumes) as DockerVolume[],
            networks: JSON.parse(row.networks) as DockerNetwork[],
            updatedAt: row.updated_at,
        };
    }

    static deleteByClientId(clientId: string): void {
        db.prepare("DELETE FROM docker_state WHERE client_id = ?").run(clientId);
    }

    /**
     * Persists the remote digest of an image update check, keyed by imageRef (tag).
     * hasUpdate is computed at read time per client by comparing remoteDigest against repoDigests.
     */
    /**
     * Removes image_update_checks entries for tags that are no longer
     * referenced by any client's docker_state.images[].repoTags.
     */
    static cleanupOrphanedImageChecks(): number {
        const result = db.prepare(`
            DELETE FROM image_update_checks
            WHERE image_ref NOT IN (
                SELECT DISTINCT tags.value
                FROM docker_state,
                     json_each(docker_state.images) AS imgs,
                     json_each(imgs.value, '$.repoTags') AS tags
            )
        `).run();
        return result.changes;
    }

    /**
     * Removes image_update_checks entries whose checked_at is older than
     * the given TTL in days. A ttlDays of 0 is a no-op.
     */
    static cleanupExpiredImageChecks(ttlDays: number): number {
        if (!Number.isFinite(ttlDays) || ttlDays <= 0) return 0;
        const result = db.prepare(
            `DELETE FROM image_update_checks WHERE checked_at < datetime('now', ?)`,
        ).run(`-${Math.floor(ttlDays)} days`);
        return result.changes;
    }

    /**
     * Returns the per-client container lists from all stored docker states,
     * together with the per-client image list so callers can resolve a
     * container's current repoTag/repoDigests.
     */
    static getAllClientStates(): Array<{
        clientId: string;
        containers: DockerContainer[];
        images: DockerImage[];
    }> {
        const rows = db
            .prepare("SELECT client_id, containers, images FROM docker_state")
            .all() as Array<{ client_id: string; containers: string; images: string }>;
        return rows.map((r) => ({
            clientId: r.client_id,
            containers: JSON.parse(r.containers) as DockerContainer[],
            images: JSON.parse(r.images) as DockerImage[],
        }));
    }

    static getAllImageRefs(): Array<{ repoTag: string; repoDigests: string[] }> {
        const rows = db.prepare("SELECT images FROM docker_state").all() as Array<{ images: string }>;
        const seen = new Set<string>();
        const result: Array<{ repoTag: string; repoDigests: string[] }> = [];
        for (const row of rows) {
            const images: Array<{ repoTags: string[]; repoDigests: string[] }> = JSON.parse(row.images);
            for (const img of images) {
                for (const tag of img.repoTags) {
                    if (!seen.has(tag)) {
                        seen.add(tag);
                        result.push({ repoTag: tag, repoDigests: img.repoDigests });
                    }
                }
            }
        }
        return result;
    }

    /**
     * Reads the cached remote digest for a given image reference.
     * Returns null when no cache entry exists.
     */
    static getCachedRemoteDigest(imageRef: string): string | null {
        const row = db
            .prepare("SELECT remote_digest FROM image_update_checks WHERE image_ref = ?")
            .get(imageRef) as { remote_digest: string | null } | undefined;
        return row?.remote_digest ?? null;
    }

    static updateImageCheckResult(
        imageRef: string,
        checkResult: { remoteDigest: string | null; checkedAt: string; error?: string },
    ): void {
        db.prepare(`
            INSERT INTO image_update_checks (image_ref, remote_digest, checked_at, error)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(image_ref) DO UPDATE SET
                remote_digest = excluded.remote_digest,
                checked_at    = excluded.checked_at,
                error         = excluded.error
        `).run(
            imageRef,
            checkResult.remoteDigest,
            checkResult.checkedAt,
            checkResult.error ?? null,
        );
    }
}
