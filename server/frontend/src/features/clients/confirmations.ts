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

/**
 * Before a new registration token is issued for a client whose agent is registered. Nothing
 * changes yet -- the risk is in what comes next: the first agent that registers with the
 * token takes the client over, and the one connected now is cut off at that moment.
 */
export function describeReregister(client: Client): ConfirmOptions {
    return {
        title: `Register a new agent for "${clientName(client)}"?`,
        description:
            "A new registration token is issued for this client. The agent connected now keeps working until an agent registers with the token; from then on only that agent is accepted, under the same client with its settings and history. Use this after reinstalling the agent or moving it to another host.",
        confirmLabel: "Generate token",
    };
}

/**
 * Before `docker system prune` on a host, as the agent runs it: without `-a` and without
 * `--volumes`. What stays is spelled out as well, since "prune" alone reads as "everything
 * unused" to anyone who knows the flags.
 */
export function describePruneSystem(client: Client): ConfirmOptions {
    return {
        title: `Prune Docker on "${clientName(client)}"?`,
        description:
            "Removes every stopped container, every network no container uses, every image without a tag and the build cache from this host, as `docker system prune` does. This cannot be undone. Volumes and tagged images are kept, even when no container uses them.",
        confirmLabel: "Prune Docker",
        variant: "danger",
    };
}
