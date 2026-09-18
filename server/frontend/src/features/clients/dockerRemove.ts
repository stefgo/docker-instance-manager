import { DockerActionType } from "@dim/shared";

/** The actions that remove something from a host, and so ask first (see describeRemove). */
export const REMOVE_ACTIONS: ReadonlySet<DockerActionType> = new Set<DockerActionType>([
    "container:remove",
    "image:remove",
    "volume:remove",
    "network:remove",
]);
