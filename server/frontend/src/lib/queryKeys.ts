/**
 * Every key the cache is addressed by, in one place.
 *
 * The keys are hierarchical on purpose: `invalidateQueries({ queryKey: docker.all })`
 * reaches every host's state, because a key matches whatever it is a prefix of.
 * `queryKeys.test.ts` holds the prefix relations the code relies on.
 */
export const queryKeys = {
    clients: {
        all: ["clients"] as const,
        list: () => ["clients", "list"] as const,
    },
    docker: {
        all: ["docker"] as const,
        /** Every host's state, without anything else that may come to live under `docker`. */
        states: () => ["docker", "state"] as const,
        state: (clientId: string) => ["docker", "state", clientId] as const,
    },
    projects: {
        all: ["projects"] as const,
        list: () => ["projects", "list"] as const,
    },
    activity: {
        all: ["activity"] as const,
        list: () => ["activity", "list"] as const,
    },
    webhooks: {
        all: ["webhooks"] as const,
        list: () => ["webhooks", "list"] as const,
    },
    settings: {
        all: ["settings"] as const,
        schedulerStatus: () => ["settings", "scheduler-status"] as const,
        autoUpdateLabel: () => ["settings", "auto-update-label"] as const,
    },
    tokens: {
        all: ["tokens"] as const,
        list: () => ["tokens", "list"] as const,
    },
    users: {
        all: ["users"] as const,
        list: () => ["users", "list"] as const,
    },
};

/**
 * What the server sends by itself on every socket connect: the client list, every host's
 * Docker state and the activity list (`WebSocketController.handleDashboardConnection`).
 * After a reconnect these are current without being asked for; everything else may have
 * changed while the socket was down and is read again.
 */
const PUSHED_ON_CONNECT: readonly (readonly string[])[] = [
    queryKeys.clients.all,
    queryKeys.docker.states(),
    queryKeys.activity.all,
];

export function isPushedOnConnect(queryKey: readonly unknown[]): boolean {
    return PUSHED_ON_CONNECT.some((prefix) => prefix.every((part, i) => queryKey[i] === part));
}

/**
 * Keys of the mutations whose being under way a list shows -- the spinner in an Update
 * column. Read back with `useMutationState`, which finds them by these.
 */
export const mutationKeys = {
    imageCheck: ["docker", "image-check"] as const,
    imageUpdate: ["docker", "image-update"] as const,
};
