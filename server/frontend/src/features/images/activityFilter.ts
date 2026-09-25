import { ActivityRecord, containerNameOf, DockerContainer, splitImageRef } from "@dim/shared";
import { imageRefKey } from "./lib/digest";

/** A container together with the host it runs on. */
export interface HostedContainer {
    clientId: string;
    container: DockerContainer;
}

/**
 * The common reading of both image pages: an event about a container belongs to the page when
 * the container is listed there -- by name, or by id where the event names none -- and an event
 * about the image alone when `matchesRef` accepts its reference.
 *
 * Containers are matched per host: the same name on another host is another container.
 */
function imageActivityMatcher(
    matchesRef: (ref: string) => boolean,
    containers: HostedContainer[],
): (event: ActivityRecord) => boolean {
    const names = new Set(containers.map(({ clientId, container }) => `${clientId}::${containerNameOf(container)}`));
    const ids = new Set(containers.map(({ clientId, container }) => `${clientId}::${container.id}`));

    return (event) => {
        const subject = event.subject;
        if (!subject) return false;
        const name = subject.containerName?.replace(/^\//, "");
        if (name) return names.has(`${event.clientId}::${name}`);
        if (subject.containerId) return ids.has(`${event.clientId}::${subject.containerId}`);
        return !!subject.imageRef && matchesRef(subject.imageRef);
    };
}

/**
 * Which activity events belong to an image page across all hosts: those about the repository
 * -- or, on a tag or digest page, about `repository:tag` -- and those about the containers
 * listed with it.
 *
 * A digest page reads like its tag's page: the events name a reference, not a digest, and a
 * pull that moved the tag belongs to the history of both.
 */
export function imageActivityFilter(
    repository: string,
    tag: string | undefined,
    containers: HostedContainer[],
): (event: ActivityRecord) => boolean {
    const repo = repository.toLowerCase();
    const key = tag === undefined ? "" : imageRefKey(`${repository}:${tag}`);
    const matchesRef = tag === undefined
        ? (ref: string) => splitImageRef(ref).repository.toLowerCase() === repo
        : (ref: string) => !!key && imageRefKey(ref) === key;
    return imageActivityMatcher(matchesRef, containers);
}

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
    const matches = imageActivityMatcher(
        (ref) => imageRefKey(ref) === key,
        containers.map((container) => ({ clientId, container })),
    );
    return (event) => event.clientId === clientId && matches(event);
}
