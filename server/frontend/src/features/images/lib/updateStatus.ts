import type { DockerImage } from "@dim/shared";
import type { UpdateStatus } from "../hooks/useImagesData";

/**
 * The update status of one image on one host, as the Update column of the image list reads
 * it: only an image in use is checked. The host's image list and the image pages its rows
 * open read it here, so a row and its page cannot disagree.
 */
export function updateStatusOf(image: DockerImage | undefined, inUse: boolean): UpdateStatus {
    if (!image || !inUse || image.repoDigests.length === 0) return "none";
    const check = image.updateCheck;
    if (!check || check.error) return "unchecked";
    return check.hasUpdate ? "update" : "current";
}
