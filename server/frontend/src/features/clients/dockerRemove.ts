import { DockerActionType, DockerState } from "@dim/shared";

export const REMOVE_ACTIONS: ReadonlySet<DockerActionType> = new Set<DockerActionType>([
    "container:remove",
    "image:remove",
    "volume:remove",
    "network:remove",
]);

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
): { title: string; description: string; confirmLabel: string } {
    switch (action) {
        case "container:remove": {
            const c = state?.containers.find((x) => x.id === target);
            const name = c?.names[0]?.replace(/^\//, "") ?? target;
            return {
                title: `Remove container "${name}"?`,
                description: "The container is removed even while it is running. Whatever it wrote inside its own filesystem is lost; its volumes are kept.",
                confirmLabel: "Remove container",
            };
        }
        case "image:remove": {
            const img = state?.images.find((x) => x.id === target);
            const name = img?.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : target;
            return {
                title: `Remove image "${name}"?`,
                description: "The image is deleted from this host and has to be pulled again to be used. Docker refuses this while a container still uses the image.",
                confirmLabel: "Remove image",
            };
        }
        case "volume:remove":
            return {
                title: `Remove volume "${target}"?`,
                description: "The volume is deleted from this host together with all data stored in it. This cannot be undone. Docker refuses this while a container still uses the volume.",
                confirmLabel: "Remove volume",
            };
        default: {
            const n = state?.networks.find((x) => x.id === target);
            return {
                title: `Remove network "${n?.name ?? target}"?`,
                description: "The network is deleted from this host. Docker refuses this while containers are still connected to it.",
                confirmLabel: "Remove network",
            };
        }
    }
}
