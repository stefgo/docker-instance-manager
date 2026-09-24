import type { ActivityRecord } from "@dim/shared";
import type { ContainerNode } from "./hooks/useContainersData";

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
    return (event) => {
        const subject = event.subject;
        if (!subject) return false;
        const name = subject.containerName?.replace(/^\//, "");
        if (name) return name === node.name;
        return !!subject.containerId && ids.has(subject.containerId);
    };
}
