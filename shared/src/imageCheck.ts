import { DockerContainer, DockerImage, ImagePlatform } from "./types.js";

/**
 * `linux/amd64` -- the key an image's platform is grouped and cached by. An image without
 * a known platform (an agent that predates it) is keyed by the empty string.
 */
export function formatPlatform(platform: ImagePlatform | undefined | null): string {
    return platform ? `${platform.os}/${platform.architecture}` : "";
}

/** Reverses `formatPlatform`; the empty string and anything malformed give `undefined`. */
export function parsePlatform(value: string): ImagePlatform | undefined {
    const slash = value.indexOf("/");
    if (slash <= 0 || slash === value.length - 1) return undefined;
    return { os: value.slice(0, slash), architecture: value.slice(slash + 1) };
}

/**
 * The digest of `repoTag` among an image's repoDigests, without the repository part
 * (`sha256:…`), or null for an image that was never pulled from a registry. This is the
 * index digest an update check compares against, and the key a check result is cached by.
 */
export function localDigestOf(repoTag: string, repoDigests: string[]): string | null {
    const refName = repoTag.split(":")[0];
    const entry = repoDigests.find((d) => d.startsWith(refName + "@"));
    return entry ? entry.split("@")[1] ?? null : null;
}

/**
 * The key one registry answer is about: a tag, the platform the local image was built for
 * and the index it was pulled from. The check targets are grouped by it, the cache is keyed
 * by the same three columns, and a sweep that has to resume names the target it stopped at
 * with it.
 */
export function imageCheckTargetKey(
    target: { repoTag: string; repoDigests: string[]; platform?: ImagePlatform },
): string {
    return [
        target.repoTag,
        formatPlatform(target.platform),
        localDigestOf(target.repoTag, target.repoDigests) ?? "",
    ].join("|");
}

const normalizeImageId = (id: string): string => (id.startsWith("sha256:") ? id : `sha256:${id}`);

/**
 * The ids of the images a host's containers run. Only these are checked for updates: an
 * image no container uses has nothing that an update would change.
 */
export function imageIdsInUse(containers: Pick<DockerContainer, "imageId">[]): Set<string> {
    return new Set(containers.filter((c) => c.imageId).map((c) => normalizeImageId(c.imageId)));
}

/** Whether a container on the same host runs `image`. */
export function isImageInUse(image: Pick<DockerImage, "id">, inUse: Set<string>): boolean {
    return inUse.has(normalizeImageId(image.id));
}

export interface ParsedRepoTag {
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
export function parseRepoTag(repoTag: string): ParsedRepoTag {
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
 * The registry host `repoTag` is pulled from. A rate limit belongs to it, not to one
 * repository: Docker Hub counts per IP or account across every repository it serves, so
 * the update checks pause and resume per registry.
 */
export function registryOf(repoTag: string): string {
    return parseRepoTag(repoTag).registry;
}

/** A registry host as the UI names it; Docker Hub's API host is not what anyone calls it. */
export function registryLabel(registry: string): string {
    return registry === "registry-1.docker.io" ? "Docker Hub" : registry;
}
