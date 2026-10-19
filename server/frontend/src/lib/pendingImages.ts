import { toDigest } from "../features/images/lib/digest";
import type { ImageCheckTarget } from "./cacheUpdates";

/** A pull that was asked for: one image reference on the hosts named. */
export interface ImageUpdateTarget {
    imageRef: string;
    clientIds: string[];
}

/**
 * The checks of a header, each asked once. A list of containers names one image as often as
 * containers run it, and a project's hosts each name the images they share; the registry is
 * asked one question per reference and set of digests, and the toast counts that.
 */
export function distinctChecks(targets: readonly ImageCheckTarget[]): ImageCheckTarget[] {
    const byKey = new Map<string, ImageCheckTarget>();
    for (const target of targets) {
        const key = `${target.imageRef}@${[...target.repoDigests].sort().join(",")}`;
        if (!byKey.has(key)) byKey.set(key, target);
    }
    return [...byKey.values()];
}

/**
 * The update checks under way, keyed the way `isCheckingImage` reads them back: by digest
 * where the check named any, by reference otherwise.
 *
 * The lists used to keep this map by hand, setting a key before the request and deleting
 * it after. It is now read off the mutations that are pending, so a key cannot be left
 * behind by a path that forgot to clear it.
 */
export function checkingImagesOf(pending: readonly ImageCheckTarget[]): Record<string, boolean> {
    const checking: Record<string, boolean> = {};
    for (const { imageRef, repoDigests } of pending) {
        const keys = repoDigests.length > 0 ? repoDigests.map(toDigest) : [imageRef];
        for (const key of keys) checking[key] = true;
    }
    return checking;
}

/** The key a pull of `imageRef` on one host is found under. */
export const updatingKey = (clientId: string, imageRef: string): string => `${clientId}::${imageRef}`;

/** The pulls under way, one key per host and reference. */
export function updatingImagesOf(pending: readonly ImageUpdateTarget[]): Record<string, boolean> {
    const updating: Record<string, boolean> = {};
    for (const { imageRef, clientIds } of pending) {
        for (const clientId of clientIds) updating[updatingKey(clientId, imageRef)] = true;
    }
    return updating;
}
