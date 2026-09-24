import { ActivityRecord, containerNameOf, splitImageRef } from "@dim/shared";
import { ProjectMembers } from "./hooks/useProjectMembers";

function refKey(ref: string): string {
    const { repository, tag } = splitImageRef(ref);
    return `${repository}:${tag}`.toLowerCase();
}

/**
 * Which activity events belong to a project.
 *
 * The server enters `subject.projectIds` on every event it stores, from the membership at
 * that moment, so that is what decides -- together with what the originator named itself:
 * the project of an auto-update run and the projects of a conflict.
 *
 * Events stored before the server did that carry no `projectIds`. For those alone the
 * current membership stands in: an event about one of the project's containers, or about
 * an image one of them runs, on the same host. A container that has left the project since
 * takes its old events with it, which is the most that can be read out of them now.
 */
export function projectActivityFilter(
    projectId: string,
    members: ProjectMembers,
): (event: ActivityRecord) => boolean {
    const containers = new Map<string, Set<string>>();
    const images = new Map<string, Set<string>>();
    for (const { clientId, containers: list } of members.perClient) {
        const keys = new Set<string>();
        const refs = new Set<string>();
        for (const container of list) {
            keys.add(container.id);
            keys.add(containerNameOf(container));
            const ref = container.configImage ?? container.image;
            if (ref) refs.add(refKey(ref));
        }
        containers.set(clientId, keys);
        images.set(clientId, refs);
    }

    return (event) => {
        const subject = event.subject;
        if (subject?.projectId === projectId) return true;
        const named = event.data?.projectIds;
        if (Array.isArray(named) && named.includes(projectId)) return true;
        if (subject?.projectIds) return subject.projectIds.includes(projectId);

        if (!subject || !event.clientId) return false;
        const name = subject.containerName?.replace(/^\//, "");
        if (subject.containerId || name) {
            const keys = containers.get(event.clientId);
            return !!keys && ((!!subject.containerId && keys.has(subject.containerId)) || (!!name && keys.has(name)));
        }
        if (subject.imageRef) {
            return images.get(event.clientId)?.has(refKey(subject.imageRef)) ?? false;
        }
        return false;
    };
}
