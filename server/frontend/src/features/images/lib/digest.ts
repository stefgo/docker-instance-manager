/** A digest that a check is keyed by, whether it arrives as `repo@sha256:…` or bare. */
export const toDigest = (d: string): string => (d.includes("@") ? d.slice(d.indexOf("@") + 1) : d);

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
