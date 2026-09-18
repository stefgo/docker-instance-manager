import { Client, CONNECTION_MODE, DockerActionType, DockerState } from "@dim/shared";
import type { ConfirmOptions } from "@stefgo/react-ui-components";
import { clientName } from "../../utils";

/**
 * Title and consequence for a remove action. The tabs pass ids, so the name is looked up
 * in the client's Docker state; the id stands in when the entry is already gone. The texts
 * follow what the agent actually does in DockerService: a container is removed with force,
 * the other three without it, which is why Docker refuses them while they are in use.
 */
export function describeRemove(
    action: DockerActionType,
    target: string,
    state: DockerState | null,
): ConfirmOptions {
    switch (action) {
        case "container:remove": {
            const c = state?.containers.find((x) => x.id === target);
            const name = c?.names[0]?.replace(/^\//, "") ?? target;
            return {
                title: `Remove container "${name}"?`,
                description: "The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept.",
                confirmLabel: "Remove container",
                variant: "danger",
            };
        }
        case "image:remove": {
            const img = state?.images.find((x) => x.id === target);
            const name = img?.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : target;
            return {
                title: `Remove image "${name}"?`,
                description: "The image is deleted from this host and has to be pulled again to be used. Docker refuses this while a container still uses the image.",
                confirmLabel: "Remove image",
                variant: "danger",
            };
        }
        case "volume:remove":
            return {
                title: `Remove volume "${target}"?`,
                description: "The volume is deleted from this host together with all data stored in it. This cannot be undone. Docker refuses this while a container still uses the volume.",
                confirmLabel: "Remove volume",
                variant: "danger",
            };
        default: {
            const n = state?.networks.find((x) => x.id === target);
            return {
                title: `Remove network "${n?.name ?? target}"?`,
                description: "The network is deleted from this host. Docker refuses this while containers are still connected to it.",
                confirmLabel: "Remove network",
                variant: "danger",
            };
        }
    }
}

/**
 * What goes with the row is the server's side only: the cached Docker state references
 * clients(id) ON DELETE CASCADE. Nothing on the host changes, and the agent keeps running
 * with credentials the server no longer accepts -- the part an operator does not expect,
 * and so the part spelled out.
 */
export function describeDeleteClient(client: Client): ConfirmOptions {
    return {
        title: `Delete "${clientName(client)}"?`,
        description:
            (client.connectionMode === CONNECTION_MODE.OUTBOUND
                ? "The server stops connecting to this host and forgets it, together with its cached Docker state."
                : "The server forgets this host, together with its cached Docker state, and refuses its agent from now on.") +
            " Containers, images and volumes on the host are not touched. To manage the host again, its agent has to be registered anew.",
        confirmLabel: "Delete client",
        variant: "danger",
    };
}

export function describeDiscardChanges(): ConfirmOptions {
    return {
        title: "Discard your changes?",
        description: "The client has not been saved. Leaving now keeps it as it was.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "danger",
    };
}
