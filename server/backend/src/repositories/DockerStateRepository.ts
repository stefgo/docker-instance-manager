import db from "../core/Database.js";
import {
    DockerState,
    DockerContainer,
    DockerImage,
    DockerImageUpdateCheck,
    DockerVolume,
    DockerNetwork,
    ImagePlatform,
    formatPlatform,
    imageCheckTargetKey,
    imageIdsInUse,
    isImageInUse,
    localDigestOf,
} from "@dim/shared";

/**
 * A row of `docker_state` (migration 01). The four collections are JSON text; they are
 * parsed into the shared Docker types on read.
 */
interface DockerStateRow {
    client_id: string;
    containers: string;
    images: string;
    volumes: string;
    networks: string;
    /** Nullable in the schema, but upsert always writes it. */
    updated_at: string;
}

/** A row of `image_update_checks` since migration 18. */
interface ImageUpdateCheckRow {
    image_ref: string;
    platform: string;
    local_digest: string;
    has_update: number;
    remote_digest: string | null;
    checked_at: string;
    error: string | null;
    /** JSON text; NULL when never fetched. */
    remote_labels: string | null;
}

/** The stored labels, or null for none and for text that is not a JSON object. */
function parseRemoteLabels(text: string | null): Record<string, string> | null {
    if (!text) return null;
    try {
        const value = JSON.parse(text) as unknown;
        return value && typeof value === "object" && !Array.isArray(value)
            ? value as Record<string, string>
            : null;
    } catch {
        return null;
    }
}

/**
 * One answer about one image, as it is stored: which tag, for which platform, about which
 * local index, and what the registry said.
 */
export interface StoredImageCheck {
    imageRef: string;
    platform?: ImagePlatform;
    localDigest: string | null;
    hasUpdate: boolean;
    remoteDigest: string | null;
    checkedAt: string;
    error?: string;
    /**
     * The remote image's OCI labels. Left out by a writer that did not fetch them; the
     * stored ones then stay as long as the remote digest does.
     */
    remoteLabels?: Record<string, string> | null;
}

/** An image the update checks have to ask about, and the clients whose answer it is. */
export interface ImageCheckTarget {
    repoTag: string;
    repoDigests: string[];
    platform?: ImagePlatform;
    clientIds: string[];
}

export class DockerStateRepository {
    /**
     * Stores an agent's snapshot. Check results are keyed by the local digest they were
     * answered for, so a re-pulled image simply stops matching its old answer; nothing
     * has to be invalidated here, and another host still on the old image keeps its own.
     */
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
        ).get(clientId) as DockerStateRow | undefined;

        if (!row) return null;

        const containers = JSON.parse(row.containers) as DockerContainer[];
        const inUse = imageIdsInUse(containers);
        const lookup = db.prepare(`
            SELECT * FROM image_update_checks
            WHERE image_ref = ? AND platform = ? AND local_digest = ?
        `);

        // Only images a container runs carry an answer: nothing else is checked.
        const images: DockerImage[] = (JSON.parse(row.images) as DockerImage[]).map((img) => {
            if (!isImageInUse(img, inUse)) return img;
            const platform = formatPlatform(img.platform);
            for (const tag of img.repoTags) {
                const localDigest = localDigestOf(tag, img.repoDigests) ?? "";
                const check = lookup.get(tag, platform, localDigest) as ImageUpdateCheckRow | undefined;
                if (!check) continue;
                return {
                    ...img,
                    updateCheck: {
                        hasUpdate: check.has_update === 1,
                        remoteDigest: check.remote_digest ?? null,
                        checkedAt: check.checked_at,
                        ...(check.error ? { error: check.error } : {}),
                        remoteLabels: parseRemoteLabels(check.remote_labels),
                    } satisfies DockerImageUpdateCheck,
                };
            }
            return img;
        });

        return {
            containers,
            images,
            volumes: JSON.parse(row.volumes) as DockerVolume[],
            networks: JSON.parse(row.networks) as DockerNetwork[],
            updatedAt: row.updated_at,
        };
    }

    /**
     * Removes image_update_checks entries no client can read any more: tags no client
     * reports, and answers about a local index no client holds -- what is left behind
     * once every host has pulled a newer image.
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
            OR (local_digest <> '' AND local_digest NOT IN (
                SELECT DISTINCT substr(digests.value, instr(digests.value, '@') + 1)
                FROM docker_state,
                     json_each(docker_state.images) AS imgs,
                     json_each(imgs.value, '$.repoDigests') AS digests
            ))
        `).run();
        return result.changes;
    }

    /**
     * Removes image_update_checks entries whose checked_at is older than
     * the given TTL in days. A ttlDays of 0 is a no-op. `checked_at` is ISO text and goes
     * through datetime(), or within the same day it would compare as text against SQLite's
     * own format.
     */
    static cleanupExpiredImageChecks(ttlDays: number): number {
        if (!Number.isFinite(ttlDays) || ttlDays <= 0) return 0;
        const result = db.prepare(
            `DELETE FROM image_update_checks WHERE datetime(checked_at) < datetime('now', ?)`,
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

    /**
     * Every image a container runs, once per tag, platform and local index, with the
     * clients that hold it. That is exactly what one registry answer covers: the same tag
     * on another platform or pulled at another time is another question.
     *
     * `repoTag` narrows it to one tag, and `repoDigests` further to the images holding
     * one of those digests -- the shape the dashboard asks a single check in.
     */
    static getImageCheckTargets(filter?: { repoTag: string; repoDigests?: string[] }): ImageCheckTarget[] {
        const rows = db
            .prepare("SELECT client_id, containers, images FROM docker_state")
            .all() as Array<{ client_id: string; containers: string; images: string }>;
        const targets = new Map<string, ImageCheckTarget>();
        for (const row of rows) {
            const inUse = imageIdsInUse(JSON.parse(row.containers) as DockerContainer[]);
            const images = JSON.parse(row.images) as DockerImage[];
            for (const img of images) {
                if (!isImageInUse(img, inUse)) continue;
                if (filter?.repoDigests?.length && !img.repoDigests.some((d) => filter.repoDigests!.includes(d))) {
                    continue;
                }
                for (const tag of img.repoTags) {
                    if (filter && tag !== filter.repoTag) continue;
                    const key = imageCheckTargetKey({
                        repoTag: tag,
                        repoDigests: img.repoDigests,
                        ...(img.platform ? { platform: img.platform } : {}),
                    });
                    const target = targets.get(key);
                    if (target) {
                        if (!target.clientIds.includes(row.client_id)) target.clientIds.push(row.client_id);
                        continue;
                    }
                    targets.set(key, {
                        repoTag: tag,
                        repoDigests: img.repoDigests,
                        ...(img.platform ? { platform: img.platform } : {}),
                        clientIds: [row.client_id],
                    });
                }
            }
        }
        return [...targets.values()];
    }

    static updateImageCheckResult(check: StoredImageCheck): void {
        this.storeCheck(check, false);
    }

    /**
     * Records that an image was not asked about, without losing what is known about it.
     *
     * A sweep stopped by the registry's rate limit leaves its remaining images unchecked.
     * Writing them a plain result would report every one of them as up to date, so only the
     * error and the timestamp are stored: the update indicator keeps the last real answer,
     * and the page says why it did not get a newer one. An image never checked before gets
     * a row of its own, with no update on record. The remote digest is not touched, so
     * neither are the labels that belong to it.
     */
    static recordImageCheckSkipped(target: ImageCheckTarget, error: string, checkedAt: string): void {
        db.prepare(`
            INSERT INTO image_update_checks
                (image_ref, platform, local_digest, has_update, remote_digest, checked_at, error)
            VALUES (?, ?, ?, 0, NULL, ?, ?)
            ON CONFLICT(image_ref, platform, local_digest) DO UPDATE SET
                checked_at = excluded.checked_at,
                error      = excluded.error
        `).run(
            target.repoTag,
            formatPlatform(target.platform),
            localDigestOf(target.repoTag, target.repoDigests) ?? "",
            checkedAt,
            error,
        );
    }

    /**
     * Stores a check result only if it is newer than the one on record.
     *
     * This is how the answers an agent reports with its auto-update run reach the cache the
     * update indicator reads. Delivery is at-least-once and a queue handed over after an
     * offline stretch is old by the time it arrives, so the guard is what keeps a repeated or
     * late batch from ageing a result the server's own sweep has since refreshed.
     */
    static updateImageCheckResultIfNewer(check: StoredImageCheck): void {
        this.storeCheck(check, true);
    }

    /**
     * The labels belong to the remote digest, which is not part of the key. A write that
     * brings none keeps the stored ones while the remote digest stays the same -- the cheap
     * path of a sweep, an agent's report -- and drops them once it names another. `IS`
     * rather than `=`, so that two NULL digests count as the same.
     */
    private static storeCheck(check: StoredImageCheck, onlyIfNewer: boolean): void {
        db.prepare(`
            INSERT INTO image_update_checks
                (image_ref, platform, local_digest, has_update, remote_digest, checked_at, error, remote_labels)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(image_ref, platform, local_digest) DO UPDATE SET
                has_update    = excluded.has_update,
                remote_labels = CASE
                    WHEN excluded.remote_labels IS NOT NULL THEN excluded.remote_labels
                    WHEN excluded.remote_digest IS image_update_checks.remote_digest
                        THEN image_update_checks.remote_labels
                    ELSE NULL
                END,
                remote_digest = excluded.remote_digest,
                checked_at    = excluded.checked_at,
                error         = excluded.error
            ${onlyIfNewer ? "WHERE excluded.checked_at > image_update_checks.checked_at" : ""}
        `).run(
            check.imageRef,
            formatPlatform(check.platform),
            check.localDigest ?? "",
            check.hasUpdate ? 1 : 0,
            check.remoteDigest,
            check.checkedAt,
            check.error ?? null,
            check.remoteLabels ? JSON.stringify(check.remoteLabels) : null,
        );
    }
}
