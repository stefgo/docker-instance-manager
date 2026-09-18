import type { ContainerInstance, ContainerTreeNode } from "./hooks/useContainersData";

// `running` is not in here: StatusDot draws the live state itself, the same glowing dot a
// connected client gets. What is left is how the dot looks while the container is not running.
// Shared by the container list and the container page, so a row and its page cannot disagree.
// `unknown` is a hollow ring: an offline host's state is not known, which is not "stopped".
export const STATE_DOT: Record<string, string> = {
    paused: "bg-warning",
    restarting: "bg-info animate-pulse",
    dead: "bg-error",
    created: "bg-accent",
    unknown: "bg-transparent border border-text-muted",
};

export const getNodeState = (node: ContainerTreeNode): string =>
    node.nodeType === "container"
        ? node.aggregateState
        : node.clientOnline ? node.containerState : "unknown";

/**
 * The containers a row can act on: every instance for a group row, the one for a client row --
 * but only where the host is connected. An action for an offline host has nobody to carry it
 * out, and its last snapshot says nothing about whether it would even apply.
 */
export function getInstances(node: ContainerTreeNode): ContainerInstance[] {
    const instances: ContainerInstance[] = node.nodeType === "container"
        ? node.instances
        : [{ clientId: node.clientId, containerId: node.containerId, state: node.containerState, clientOnline: node.clientOnline }];
    return instances.filter((i) => i.clientOnline);
}

/** The page of a container row. A client row opens the page of the container it belongs to. */
export function containerPath(node: ContainerTreeNode): string {
    const id = node.nodeType === "container" ? node.id : node.id.slice(0, node.id.lastIndexOf("||"));
    return `/container/${encodeURIComponent(id)}`;
}
