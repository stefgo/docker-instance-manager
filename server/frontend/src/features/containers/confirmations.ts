import type { ConfirmOptions } from "@stefgo/react-ui-components";
import type { ClientNode, ContainerTreeNode } from "./hooks/useContainersData";
import { getInstances } from "./containerState";

/**
 * A container row stands for every instance of that name across clients, and Remove on it
 * removes all of them -- which the title has to say, not just the name. It counts the
 * instances on connected hosts only: those are the ones the action reaches. The agent removes
 * with force (DockerService), so a running container goes too.
 */
export function describeRemoveContainer(node: ContainerTreeNode): ConfirmOptions {
    const count = getInstances(node).length;
    const title =
        node.nodeType === "client"
            ? `Remove container "${node.containerName}" on ${node.clientName}?`
            : count === 1
                ? `Remove container "${node.name}"?`
                : `Remove container "${node.name}" on all ${count} clients?`;
    return {
        title,
        description: "The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept.",
        confirmLabel: "Remove container",
        variant: "danger",
    };
}

/**
 * Start and stop of one instance, for the container page, whose buttons sit in the open
 * rather than behind a menu. Stop is not a danger: nothing is lost, but what the container
 * serves is gone until it starts again.
 */
export function describeStartContainer(node: ClientNode): ConfirmOptions {
    return {
        title: `Start container "${node.containerName}" on ${node.clientName}?`,
        description: "The container starts with the configuration it was created with.",
        confirmLabel: "Start container",
    };
}

export function describeStopContainer(node: ClientNode): ConfirmOptions {
    return {
        title: `Stop container "${node.containerName}" on ${node.clientName}?`,
        description: "Whatever the container serves is unavailable until it is started again. Its data is kept.",
        confirmLabel: "Stop container",
    };
}
