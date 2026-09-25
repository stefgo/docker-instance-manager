import { ActivityRecord, containerNameOf, DockerContainer } from "@dim/shared";
import { imageRefKey } from "./lib/digest";

/**
 * Which activity events belong to an image page on one host: those its host reported or the
 * server recorded about the reference -- a pull, a check, a removal -- and those about the
 * containers listed with it.
 *
 * The reference decides rather than the image id, as it does for the page: a pull moves the
 * tag to another image, and its history goes along. The containers are matched by name and
 * id, the way the container pages match them.
 */
export function imageInstanceActivityFilter(
    clientId: string,
    imageRef: string,
    containers: DockerContainer[],
): (event: ActivityRecord) => boolean {
    const key = imageRefKey(imageRef);
    const names = new Set(containers.map(containerNameOf));
    const ids = new Set(containers.map((c) => c.id));

    return (event) => {
        const subject = event.subject;
        if (!subject || event.clientId !== clientId) return false;
        const name = subject.containerName?.replace(/^\//, "");
        if (name) return names.has(name);
        if (subject.containerId) return ids.has(subject.containerId);
        return !!subject.imageRef && imageRefKey(subject.imageRef) === key;
    };
}
