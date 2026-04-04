import { ImageUpdateCheckResult } from "@dim/shared";
import { logger } from "../core/logger.js";

interface ParsedRepoTag {
    registry: string;
    name: string;
    tag: string;
}

/**
 * Parses a Docker image reference into registry, name, and tag.
 * Examples:
 *   "nginx:latest"              → { registry: "registry-1.docker.io", name: "library/nginx", tag: "latest" }
 *   "myuser/myimage:1.0"        → { registry: "registry-1.docker.io", name: "myuser/myimage", tag: "1.0" }
 *   "ghcr.io/owner/image:tag"   → { registry: "ghcr.io", name: "owner/image", tag: "tag" }
 */
function parseRepoTag(repoTag: string): ParsedRepoTag {
    // Strip digest if present (e.g. "nginx@sha256:abc" → "nginx")
    const withoutDigest = repoTag.split("@")[0];

    let registry = "registry-1.docker.io";
    let rest = withoutDigest;

    const firstSlash = withoutDigest.indexOf("/");
    if (firstSlash !== -1) {
        const possibleRegistry = withoutDigest.substring(0, firstSlash);
        // A registry hostname contains a dot or colon, or is "localhost"
        if (
            possibleRegistry.includes(".") ||
            possibleRegistry.includes(":") ||
            possibleRegistry === "localhost"
        ) {
            registry = possibleRegistry;
            rest = withoutDigest.substring(firstSlash + 1);
        }
    }

    const colonIdx = rest.lastIndexOf(":");
    let name: string;
    let tag: string;

    if (colonIdx !== -1) {
        name = rest.substring(0, colonIdx);
        tag = rest.substring(colonIdx + 1);
    } else {
        name = rest;
        tag = "latest";
    }

    // Docker Hub official images live under "library/"
    if (registry === "registry-1.docker.io" && !name.includes("/")) {
        name = `library/${name}`;
    }

    return { registry, name, tag };
}

/**
 * Fetches a Bearer token for the given registry and repository scope.
 * Works for Docker Hub and ghcr.io (anonymous, public images).
 */
async function fetchToken(registry: string, name: string): Promise<string | null> {
    const authUrls: Record<string, string> = {
        "registry-1.docker.io": `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull`,
        "ghcr.io": `https://ghcr.io/token?scope=repository:${name}:pull`,
        "lscr.io": `https://ghcr.io/token?scope=repository:${name}:pull`,
    };

    const authUrl = authUrls[registry];
    if (!authUrl) {
        // For unknown registries try the standard WWW-Authenticate flow via a HEAD request
        return null;
    }

    try {
        const res = await fetch(authUrl);
        if (!res.ok) return null;
        const data = await res.json() as { token?: string; access_token?: string };
        return data.token ?? data.access_token ?? null;
    } catch {
        return null;
    }
}

/**
 * Fetches the manifest digest for the given image reference from its registry.
 * Returns the value of the Docker-Content-Digest response header.
 */
async function fetchRemoteDigest(parsedRepoTag: ParsedRepoTag): Promise<string | null> {
    const token = await fetchToken(parsedRepoTag.registry, parsedRepoTag.name);

    const url = `https://${parsedRepoTag.registry}/v2/${parsedRepoTag.name}/manifests/${parsedRepoTag.tag}`;
    const headers: Record<string, string> = {
        // Prefer multi-arch manifest list so the digest matches what Docker stores
        Accept: [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.docker.distribution.manifest.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
        ].join(", "),
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(url, { method: "HEAD", headers });
        if (!res.ok) {
            logger.warn({ url, status: res.status }, "Registry manifest request failed");
            return null;
        }
        return res.headers.get("Docker-Content-Digest");
    } catch (err) {
        logger.warn({ err, url }, "Failed to fetch remote manifest digest");
        return null;
    }
}

export class ImageUpdateService {
    /**
     * Checks whether a newer version of the given image is available in its registry.
     * Compares the remote manifest digest against the local repoDigests.
     *
     * @param repoTag   - The image reference as stored in repoTags (e.g. "nginx:latest") die get remote digests
     * @param repoDigests - The repoDigests array from the local DockerImage to check against
     */
    static async checkForUpdate(
        repoTag: string,
        repoDigests: string[],
    ): Promise<ImageUpdateCheckResult> {
        // Find the local digest that matches this image ref (ignore tag, match by name)
        const refName = repoTag.split(":")[0];
        const localDigestEntry = repoDigests.find((d) => d.startsWith(refName + "@"));
        const localDigest = localDigestEntry ? localDigestEntry.split("@")[1] ?? null : null;

        try {
            const parsed = parseRepoTag(repoTag);
            const remoteDigest = await fetchRemoteDigest(parsed);

            if (!remoteDigest) {
                return { repoTag, localDigest, remoteDigest: null, hasUpdate: false, error: "Remote digest not available" };
            }

            const hasUpdate = localDigest !== null && localDigest !== remoteDigest;
            return { repoTag, localDigest, remoteDigest, hasUpdate };
        } catch (err: any) {
            logger.error({ err, imageRef: repoTag }, "Image update check failed");
            return { repoTag, localDigest, remoteDigest: null, hasUpdate: false, error: err?.message || String(err) };
        }
    }
}
