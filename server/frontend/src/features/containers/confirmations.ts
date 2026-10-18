import type { ConfirmOptions } from "@stefgo/react-ui-components";
import type { ClientNode, ContainerTreeNode } from "./lib/containerGroups";
import { getInstances } from "./containerState";
import { plural } from "../../utils";

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

/**
 * What a header button leaves of the selection, when it reaches fewer containers than are
 * picked: a stop reaches the running ones only, so the count in the title is not the count
 * behind the list's title, and the dialog says why.
 */
function leftOfSelection(reached: number, selected: number, rest: string): string {
    if (reached >= selected) return "";
    return ` ${reached} of the ${plural(selected, "selected container")} ${reached === 1 ? "is" : "are"} reached; ${rest}`;
}

/** Start for a selection: the stopped containers of it on connected hosts. */
export function describeStartSelection(instances: readonly { clientId: string }[], selected: number): ConfirmOptions {
    const hosts = new Set(instances.map((i) => i.clientId)).size;
    return {
        title: `Start ${plural(instances.length, "container")} on ${plural(hosts, "host")}?`,
        description: "The containers start with the configuration they were created with."
            + leftOfSelection(instances.length, selected, "the others are running already or their host is offline."),
        confirmLabel: "Start containers",
    };
}

/**
 * Stop for a selection. A single row stops without a question; several at once are one
 * click for a larger outage, so the count and the hosts are named first.
 */
export function describeStopSelection(instances: readonly { clientId: string }[], selected: number): ConfirmOptions {
    const hosts = new Set(instances.map((i) => i.clientId)).size;
    return {
        title: `Stop ${plural(instances.length, "container")} on ${plural(hosts, "host")}?`,
        description: "Nothing is lost, but what the containers serve is gone until they are started again."
            + leftOfSelection(instances.length, selected, "the others are not running or their host is offline."),
        confirmLabel: "Stop containers",
    };
}
