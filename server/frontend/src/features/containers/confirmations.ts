import type { ConfirmOptions } from "@stefgo/react-ui-components";
import type { ContainerTreeNode } from "./hooks/useContainersData";
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
