import { splitImageRef } from "@dim/shared";

/** A digest that a check is keyed by, whether it arrives as `repo@sha256:…` or bare. */
export const toDigest = (d: string): string => (d.includes("@") ? d.slice(d.indexOf("@") + 1) : d);

/** A digest or image id the way Docker prints it: twelve hex characters, no algorithm. */
export const shortDigest = (id: string): string => id.replace(/^sha256:/, "").slice(0, 12);

/** An image reference for display: a bare image id shortened, a name left as it is. */
export const shortImageRef = (ref: string): string => (ref.startsWith("sha256:") ? shortDigest(ref) : ref);

/** An image id with its algorithm, the way the agents report it in most places: `sha256:…`. */
export const normalizeImageId = (id: string): string => (id.startsWith("sha256:") ? id : `sha256:${id}`);

/** Whether a check for an image with these digests (or, without any, this reference) runs. */
export const isCheckingImage = (
    checkingImages: Record<string, boolean>,
    repoDigests: string[],
    ref: string,
): boolean =>
    repoDigests.length > 0
        ? repoDigests.some((d) => !!checkingImages[toDigest(d)])
        : !!checkingImages[ref];

/**
 * An image reference reduced to what compares: `repository:tag`, lower case, `latest` where it
 * names no tag. A reference pinned to a digest names no tag to compare, and gives nothing.
 */
export const imageRefKey = (ref: string): string => {
    if (!ref || ref.includes("@")) return "";
    const { repository, tag } = splitImageRef(ref);
    return `${repository}:${tag}`.toLowerCase();
};
