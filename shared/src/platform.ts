import { ImagePlatform } from "./types.js";

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
