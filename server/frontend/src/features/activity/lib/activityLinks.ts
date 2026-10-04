import type { ActivityRecord } from "@dim/shared";
import { paths } from "../../../lib/paths";

/**
 * Where the chips of an event lead: the page of the host it happened on, of the container
 * and the image on that host, and of the project. A chip without a target stays text.
 *
 * A container and an image are named per host, so both need the client -- and one that has
 * been deleted since has no page left, which is why the ids of the known clients are asked
 * for. The project is linked only where the event names exactly one: a container in conflict
 * carries several ids under one name, and none of them is "the" project.
 */
export interface ActivityLinks {
    client?: string;
    container?: string;
    image?: string;
    project?: string;
}

export function activityLinks(event: ActivityRecord, knownClientIds: ReadonlySet<string>): ActivityLinks {
    const links: ActivityLinks = {};
    const subject = event.subject;
    const clientId = event.clientId && knownClientIds.has(event.clientId) ? event.clientId : null;

    if (clientId) {
        links.client = paths.client(clientId);
        if (subject?.containerName) links.container = paths.containerInstance(clientId, subject.containerName);
        if (subject?.imageRef) links.image = paths.imageInstance(clientId, subject.imageRef);
    }

    const projectIds = subject?.projectIds ?? [];
    const projectId = subject?.projectId ?? (projectIds.length === 1 ? projectIds[0] : undefined);
    if (projectId) links.project = paths.project(projectId);

    return links;
}
