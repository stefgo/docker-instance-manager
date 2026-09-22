import { ImagePlatform, ImageUpdateCheckResult } from "../types.js";
import { formatPlatform, localDigestOf } from "../imageCheck.js";
import { logger } from "./logger.js";

/**
 * Registry manifest checks: does a newer image exist behind a tag, and when was it built.
 *
 * Lives here rather than in the backend because the agent asks the same question of the
 * same registries once it updates its images on its own. Nothing in it touches Docker or
 * the database -- `fetch` and the logger are the whole dependency list, and the logger is
 * what makes it Node-only.
 */

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
 * The parts of a registry manifest this check reads. A manifest list carries `manifests`,
 * a single-platform manifest carries `config`; everything else in the document is left
 * unnamed because nothing here looks at it.
 */
type RegistryManifest = {
    manifests?: {
        digest?: string;
        platform?: { os?: string; architecture?: string };
    }[];
    config?: { digest?: string };
};

/**
 * The image config blob: its creation date, and the platform a single-platform manifest
 * does not state anywhere else.
 */
type RegistryConfigBlob = { created?: string; os?: string; architecture?: string };

/**
 * Fetches a manifest body (GET) for a given reference (tag or digest).
 */
async function fetchManifestBody(
    parsedRepoTag: ParsedRepoTag,
    reference: string,
    token: string | null,
): Promise<RegistryManifest | null> {
    const url = `https://${parsedRepoTag.registry}/v2/${parsedRepoTag.name}/manifests/${reference}`;
    const headers: Record<string, string> = {
        Accept: [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.docker.distribution.manifest.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
        ].join(", "),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Fetches an image config blob by digest and returns the parsed JSON.
 */
async function fetchConfigBlob(
    parsedRepoTag: ParsedRepoTag,
    digest: string,
    token: string | null,
): Promise<RegistryConfigBlob | null> {
    const url = `https://${parsedRepoTag.registry}/v2/${parsedRepoTag.name}/blobs/${digest}`;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Fetches the manifest digest for the given image reference from its registry.
 * Returns the value of the Docker-Content-Digest response header.
 */
async function fetchRemoteDigest(parsedRepoTag: ParsedRepoTag, token: string | null): Promise<string | null> {
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

function matchesPlatform(
    candidate: { os?: string; architecture?: string } | undefined,
    platform: ImagePlatform,
): boolean {
    return candidate?.os === platform.os && candidate?.architecture === platform.architecture;
}

/**
 * The digest of the manifest `platform` resolves to inside `manifest`, which was fetched
 * by `digest`. An index names it in the entry for that platform; a single-platform
 * manifest is its own answer, but only if its config blob says it was built for that
 * platform. `null` when the image does not exist for the platform.
 *
 * `platform.variant` (arm/v6 vs. arm/v7) is not looked at: the first entry with the right
 * OS and architecture wins.
 */
async function resolvePlatformDigest(
    parsedRepoTag: ParsedRepoTag,
    manifest: RegistryManifest,
    digest: string,
    platform: ImagePlatform,
    token: string | null,
): Promise<string | null> {
    if (Array.isArray(manifest.manifests)) {
        return manifest.manifests.find((m) => matchesPlatform(m.platform, platform))?.digest ?? null;
    }
    const configDigest = manifest.config?.digest;
    if (!configDigest) return null;
    const config = await fetchConfigBlob(parsedRepoTag, configDigest, token);
    return matchesPlatform(config ?? undefined, platform) ? digest : null;
}

export class ImageUpdateService {
    /**
     * Fetches the creation date of the remote image manifest.
     *
     * With `platform`, the date is that of the image built for it, and null when the
     * registry has none. Without it, a manifest list resolves to linux/amd64 or, failing
     * that, its first entry -- the behaviour for callers that do not know the platform.
     * Returns null if the date cannot be determined.
     */
    static async fetchManifestCreatedDate(repoTag: string, platform?: ImagePlatform): Promise<Date | null> {
        try {
            const parsed = parseRepoTag(repoTag);
            const token = await fetchToken(parsed.registry, parsed.name);

            let manifest = await fetchManifestBody(parsed, parsed.tag, token);
            if (!manifest) return null;

            if (Array.isArray(manifest.manifests)) {
                const entry = platform
                    ? manifest.manifests.find((m) => matchesPlatform(m.platform, platform))
                    : manifest.manifests.find(
                        (m) => matchesPlatform(m.platform, { os: "linux", architecture: "amd64" }),
                    ) ?? manifest.manifests[0];
                if (!entry?.digest) return null;
                manifest = await fetchManifestBody(parsed, entry.digest, token);
                if (!manifest) return null;
            }

            const configDigest = manifest.config?.digest;
            if (!configDigest) return null;

            const config = await fetchConfigBlob(parsed, configDigest, token);
            if (!config?.created) return null;
            // A single-platform tag built for another platform has no date that applies here.
            if (platform && config.os !== undefined && !matchesPlatform(config, platform)) {
                return null;
            }

            const date = new Date(config.created);
            return isNaN(date.getTime()) ? null : date;
        } catch (err) {
            logger.warn({ err, repoTag }, "Failed to fetch manifest created date");
            return null;
        }
    }

    /**
     * Checks whether a newer version of the given image is available in its registry.
     *
     * The local repoDigest is the digest of the index the image was pulled from, and an
     * index covers every platform. Comparing it alone reports an update whenever any
     * platform in it was rebuilt. With `platform` -- the one the local image was built for
     * -- the answer is about that platform only:
     *
     * - the registry has no image for it: no update, and the check carries an error;
     * - the index digests differ: the entries for the platform in the old and the new
     *   index are compared. The old index is fetched by the local digest; if the registry
     *   no longer has it, the change is taken as an update.
     *
     * Without `platform` the index digests are compared as they are.
     *
     * @param repoTag     - The image reference as stored in repoTags (e.g. "nginx:latest")
     * @param repoDigests - The repoDigests array from the local DockerImage to check against
     * @param platform    - The platform of the local image, from `image inspect`
     */
    static async checkForUpdate(
        repoTag: string,
        repoDigests: string[],
        platform?: ImagePlatform,
    ): Promise<ImageUpdateCheckResult> {
        const localDigest = localDigestOf(repoTag, repoDigests);

        try {
            const parsed = parseRepoTag(repoTag);
            const token = await fetchToken(parsed.registry, parsed.name);
            const remoteDigest = await fetchRemoteDigest(parsed, token);

            if (!remoteDigest) {
                return {
                    repoTag, localDigest, remoteDigest: null, hasUpdate: false, platform,
                    error: "Remote digest not available",
                };
            }

            if (!platform) {
                const hasUpdate = localDigest !== null && localDigest !== remoteDigest;
                return { repoTag, localDigest, remoteDigest, hasUpdate };
            }

            // Fetched by digest, not by tag, so the body is the one the HEAD request named.
            const remoteManifest = await fetchManifestBody(parsed, remoteDigest, token);
            if (!remoteManifest) {
                return {
                    repoTag, localDigest, remoteDigest, hasUpdate: false, platform,
                    error: "Remote manifest not available",
                };
            }
            const remotePlatformDigest = await resolvePlatformDigest(
                parsed, remoteManifest, remoteDigest, platform, token,
            );
            if (!remotePlatformDigest) {
                return {
                    repoTag, localDigest, remoteDigest, hasUpdate: false, platform,
                    remotePlatformDigest: null,
                    error: `No image for ${formatPlatform(platform)}`,
                };
            }

            if (localDigest === null || localDigest === remoteDigest) {
                return { repoTag, localDigest, remoteDigest, hasUpdate: false, platform, remotePlatformDigest };
            }

            const localManifest = await fetchManifestBody(parsed, localDigest, token);
            const localPlatformDigest = localManifest
                ? await resolvePlatformDigest(parsed, localManifest, localDigest, platform, token)
                : null;
            const hasUpdate = localPlatformDigest === null || localPlatformDigest !== remotePlatformDigest;
            return { repoTag, localDigest, remoteDigest, hasUpdate, platform, remotePlatformDigest };
        } catch (err) {
            logger.error({ err, imageRef: repoTag }, "Image update check failed");
            return {
                repoTag,
                localDigest,
                remoteDigest: null,
                hasUpdate: false,
                platform,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
