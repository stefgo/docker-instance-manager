import type { ActivityRecord } from "@dim/shared";
import type { ClientNode, ContainerNode } from "./hooks/useContainersData";

/**
 * Whether an event is about a container of `name`, or -- where it names none -- about one of
 * `ids`. An event about the image alone, without a container, is about neither.
 */
function isAboutContainer(event: ActivityRecord, name: string, ids: Set<string>): boolean {
    const subject = event.subject;
    if (!subject) return false;
    const eventName = subject.containerName?.replace(/^\//, "");
    if (eventName) return eventName === name;
    return !!subject.containerId && ids.has(subject.containerId);
}

/**
 * Which activity events belong to a container page: those about a container of its name, on
 * any host.
 *
 * The name decides rather than the id, since every recreate gives the container a new id
 * and would leave its history behind. The ids of the current instances count as well, for
 * an event that names no container. An event about the image alone -- a pull without a
 * container named -- is not the container's.
 */
export function containerActivityFilter(node: ContainerNode): (event: ActivityRecord) => boolean {
    const ids = new Set(node.instances.map((i) => i.containerId));
    return (event) => isAboutContainer(event, node.name, ids);
}

/**
 * Which activity events belong to an instance page: the same reading as the container page,
 * limited to the events its host reported or the server recorded for it.
 */
export function containerInstanceActivityFilter(node: ClientNode): (event: ActivityRecord) => boolean {
    const ids = new Set([node.containerId]);
    return (event) =>
        event.clientId === node.clientId && isAboutContainer(event, node.containerName, ids);
}

/**
 * Which activity events belong to the container list of one host: those its host reported or
 * the server recorded about any of its containers, by name or id. An event about an image
 * alone belongs to the host's image list instead.
 */
export function clientContainersActivityFilter(clientId: string): (event: ActivityRecord) => boolean {
    return (event) =>
        event.clientId === clientId && !!(event.subject?.containerName || event.subject?.containerId);
}
