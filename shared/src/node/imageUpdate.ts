import { ImagePlatform, ImageUpdateCheckResult } from "../types.js";
import { RATE_LIMIT_FALLBACK_SECONDS } from "../constants.js";
import { ParsedRepoTag, formatPlatform, localDigestOf, parseRepoTag } from "../imageCheck.js";
import { logger } from "./logger.js";

/**
 * Registry manifest checks: does a newer image exist behind a tag, and when was it built.
 *
 * Lives here rather than in the backend because the agent asks the same question of the
 * same registries once it updates its images on its own. Nothing in it touches Docker or
 * the database -- `fetch` and the logger are the whole dependency list, and the logger is
 * what makes it Node-only.
 */

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
 * The image config blob: its creation date, the platform a single-platform manifest does
 * not state anywhere else, and the labels the image was built with.
 */
type RegistryConfigBlob = {
    created?: string;
    os?: string;
    architecture?: string;
    config?: { Labels?: Record<string, string> | null };
};

/**
 * Only the OCI annotations are kept: they say what the new image is (version, revision,
 * source), and an image may carry any number of other labels of any size.
 */
const REMOTE_LABEL_PREFIX = "org.opencontainers.image.";

/**
 * Why a registry request came back without an answer, in the words the UI shows.
 *
 * The status is what tells a rate limit apart from a missing tag, and a sweep over many
 * images has to know the difference: the one is over in an hour, the other never.
 */
interface RegistryFailure {
    error: string;
    rateLimited: boolean;
    /** With `rateLimited`: how long to leave the registry alone. */
    retryAfterSeconds?: number;
}

/**
 * `Retry-After` in seconds. The header is either a number of seconds or an HTTP date; a
 * missing or unreadable one gives the fallback, so a limit always comes with a pause.
 */
function parseRetryAfter(value: string | null): number {
    if (value) {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
        const date = Date.parse(trimmed);
        if (!isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
    }
    return RATE_LIMIT_FALLBACK_SECONDS;
}

/**
 * The `ratelimit-remaining` header, `76;w=21600` at Docker Hub: the count before the
 * semicolon. `undefined` for a registry that does not send it.
 */
function readRemaining(headers: Headers): number | undefined {
    const value = headers.get("ratelimit-remaining");
    if (!value) return undefined;
    const count = parseInt(value.split(";")[0].trim(), 10);
    return Number.isFinite(count) ? count : undefined;
}

function describeStatus(status: number, headers: Headers): RegistryFailure {
    if (status === 429) {
        return {
            error: "Registry rate limit reached (429)",
            rateLimited: true,
            retryAfterSeconds: parseRetryAfter(headers.get("retry-after")),
        };
    }
    if (status === 401 || status === 403) return { error: `Registry denied access (${status})`, rateLimited: false };
    if (status === 404) return { error: "Tag not found in registry (404)", rateLimited: false };
    return { error: `Registry request failed (HTTP ${status})`, rateLimited: false };
}

/** What a rate limit adds to a check result; nothing for any other failure. */
function rateLimitFields(
    failure: RegistryFailure | undefined,
): Pick<ImageUpdateCheckResult, "rateLimited" | "retryAfterSeconds"> {
    if (!failure?.rateLimited) return {};
    return {
        rateLimited: true,
        ...(failure.retryAfterSeconds !== undefined ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
    };
}

const UNREACHABLE: RegistryFailure = { error: "Registry unreachable", rateLimited: false };

/**
 * Fetches a manifest body (GET) for a given reference (tag or digest).
 */
async function fetchManifestBody(
    parsedRepoTag: ParsedRepoTag,
    reference: string,
    token: string | null,
): Promise<{ manifest: RegistryManifest | null; failure?: RegistryFailure; remaining?: number }> {
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
        const remaining = readRemaining(res.headers);
        if (!res.ok) return { manifest: null, failure: describeStatus(res.status, res.headers), remaining };
        return { manifest: await res.json(), remaining };
    } catch {
        return { manifest: null, failure: UNREACHABLE };
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
async function fetchRemoteDigest(
    parsedRepoTag: ParsedRepoTag,
    token: string | null,
): Promise<{ digest: string | null; failure?: RegistryFailure; remaining?: number }> {
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
        const remaining = readRemaining(res.headers);
        if (!res.ok) {
            logger.warn({ url, status: res.status }, "Registry manifest request failed");
            return { digest: null, failure: describeStatus(res.status, res.headers), remaining };
        }
        const digest = res.headers.get("Docker-Content-Digest");
        // A 200 without the header leaves the check without an answer all the same.
        return digest
            ? { digest, remaining }
            : { digest: null, failure: { error: "Registry returned no digest", rateLimited: false }, remaining };
    } catch (err) {
        logger.warn({ err, url }, "Failed to fetch remote manifest digest");
        return { digest: null, failure: UNREACHABLE };
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

/**
 * The OCI labels of the image `platformDigest` names, read from its config blob. The
 * manifest costs one counted request, the blob none at Docker Hub -- unless `manifest` is
 * that manifest already, as for a single-platform tag. `null` when they cannot be read;
 * an image without such labels gives an empty object.
 */
async function fetchImageLabels(
    parsedRepoTag: ParsedRepoTag,
    platformDigest: string,
    token: string | null,
    manifest?: RegistryManifest,
): Promise<{ labels: Record<string, string> | null; remaining?: number }> {
    let remaining: number | undefined;
    let configDigest = manifest?.config?.digest;
    if (!configDigest) {
        const platformManifest = await fetchManifestBody(parsedRepoTag, platformDigest, token);
        remaining = platformManifest.remaining;
        configDigest = platformManifest.manifest?.config?.digest;
    }
    if (!configDigest) return { labels: null, remaining };
    const config = await fetchConfigBlob(parsedRepoTag, configDigest, token);
    if (!config) return { labels: null, remaining };
    const labels = Object.fromEntries(
        Object.entries(config.config?.Labels ?? {})
            .filter(([key, value]) => key.startsWith(REMOTE_LABEL_PREFIX) && typeof value === "string"),
    );
    return { labels, remaining };
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

            let manifest = (await fetchManifestBody(parsed, parsed.tag, token)).manifest;
            if (!manifest) return null;

            if (Array.isArray(manifest.manifests)) {
                const entry = platform
                    ? manifest.manifests.find((m) => matchesPlatform(m.platform, platform))
                    : manifest.manifests.find(
                        (m) => matchesPlatform(m.platform, { os: "linux", architecture: "amd64" }),
                    ) ?? manifest.manifests[0];
                if (!entry?.digest) return null;
                manifest = (await fetchManifestBody(parsed, entry.digest, token)).manifest;
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
     * - the index digests are equal: no update, answered by the HEAD request alone. An
     *   unchanged index necessarily still holds the platform the host runs;
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

        // The last `ratelimit-remaining` any answer carried, reported with the result.
        let remaining: number | undefined;
        const note = <T extends { remaining?: number }>(response: T): T => {
            if (response.remaining !== undefined) remaining = response.remaining;
            return response;
        };
        const answer = (result: ImageUpdateCheckResult): ImageUpdateCheckResult =>
            remaining === undefined ? result : { ...result, rateLimitRemaining: remaining };

        try {
            const parsed = parseRepoTag(repoTag);
            const token = await fetchToken(parsed.registry, parsed.name);
            const { digest: remoteDigest, failure } = note(await fetchRemoteDigest(parsed, token));

            if (!remoteDigest) {
                return answer({
                    repoTag, localDigest, remoteDigest: null, hasUpdate: false, platform,
                    error: failure?.error ?? "Remote digest not available",
                    ...rateLimitFields(failure),
                });
            }

            // The same digest means a byte-identical index, so no update. Without a local
            // digest there is nothing to compare. Either way the HEAD answer is the whole
            // answer, and the sweep over an unchanged fleet costs one request per image.
            if (!platform || localDigest === null || localDigest === remoteDigest) {
                const hasUpdate = localDigest !== null && localDigest !== remoteDigest;
                return answer({ repoTag, localDigest, remoteDigest, hasUpdate, ...(platform ? { platform } : {}) });
            }

            // Fetched by digest, not by tag, so the body is the one the HEAD request named.
            const remote = note(await fetchManifestBody(parsed, remoteDigest, token));
            if (!remote.manifest) {
                return answer({
                    repoTag, localDigest, remoteDigest, hasUpdate: false, platform,
                    error: remote.failure?.error ?? "Remote manifest not available",
                    ...rateLimitFields(remote.failure),
                });
            }
            const remoteManifest = remote.manifest;
            const remotePlatformDigest = await resolvePlatformDigest(
                parsed, remoteManifest, remoteDigest, platform, token,
            );
            if (!remotePlatformDigest) {
                return answer({
                    repoTag, localDigest, remoteDigest, hasUpdate: false, platform,
                    remotePlatformDigest: null,
                    error: `No image for ${formatPlatform(platform)}`,
                });
            }

            const local = note(await fetchManifestBody(parsed, localDigest, token));
            // A registry that refused the request has not said the old index is gone, so the
            // rule below -- a missing old index counts as an update -- must not apply to it.
            if (!local.manifest && local.failure?.rateLimited) {
                return answer({
                    repoTag, localDigest, remoteDigest, hasUpdate: false, platform, remotePlatformDigest,
                    error: local.failure.error, ...rateLimitFields(local.failure),
                });
            }
            const localPlatformDigest = local.manifest
                ? await resolvePlatformDigest(parsed, local.manifest, localDigest, platform, token)
                : null;
            const hasUpdate = localPlatformDigest === null || localPlatformDigest !== remotePlatformDigest;
            if (!hasUpdate) {
                return answer({ repoTag, localDigest, remoteDigest, hasUpdate, platform, remotePlatformDigest });
            }
            // Only an image with an update is worth describing: one more request, paid once
            // per new remote digest, since the stored labels outlive the sweeps after it.
            const { labels: remoteLabels } = note(await fetchImageLabels(
                parsed, remotePlatformDigest, token,
                Array.isArray(remoteManifest.manifests) ? undefined : remoteManifest,
            ));
            return answer({
                repoTag, localDigest, remoteDigest, hasUpdate, platform, remotePlatformDigest, remoteLabels,
            });
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
