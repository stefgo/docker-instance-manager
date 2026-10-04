import {
    CLIENT_STATUS,
    type Client,
    type DockerContainer,
    type DockerImage,
    type DockerState,
    type ProjectSummary,
} from "@dim/shared";

/** A fleet for the tests of what is computed across hosts, with only what they vary. */

export const client = (id: string, over: Partial<Client> = {}): Client => ({
    id,
    hostname: id,
    status: CLIENT_STATUS.ONLINE,
    lastSeen: "2026-10-03T12:00:00Z",
    ...over,
});

export const offline = (id: string): Client => client(id, { status: CLIENT_STATUS.OFFLINE });

export const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "c1",
    names: ["/web"],
    image: "nginx:1.27",
    configImage: "nginx:1.27",
    imageId: "sha256:aaa",
    command: "",
    created: 0,
    state: "running",
    ports: [],
    labels: {},
    ...over,
});

export const image = (over: Partial<DockerImage> = {}): DockerImage => ({
    id: "sha256:aaa",
    parentId: "",
    repoTags: ["nginx:1.27"],
    repoDigests: ["nginx@sha256:d1"],
    created: 0,
    size: 0,
    labels: null,
    ...over,
});

export const check = (hasUpdate: boolean, error?: string): NonNullable<DockerImage["updateCheck"]> => ({
    hasUpdate,
    remoteDigest: null,
    checkedAt: "2026-10-03T11:00:00Z",
    ...(error ? { error } : {}),
});

export const dockerState = (containers: DockerContainer[], images: DockerImage[] = []): DockerState => ({
    containers,
    images,
    volumes: [],
    networks: [],
    updatedAt: "2026-10-03T12:00:00Z",
});

/** A project whose query is one container name, wildcards allowed. */
export const project = (id: string, containerName: string): ProjectSummary =>
    ({
        id,
        name: `project-${id}`,
        autoUpdate: false,
        cron: null,
        query: [
            { id: "q1", join: "and", field: "container.name", op: "wildcard", negate: false, value: containerName },
        ],
    }) as ProjectSummary;
