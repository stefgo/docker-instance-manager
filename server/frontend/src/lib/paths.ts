import { generatePath } from "react-router-dom";

/**
 * Every path of the application, once. The routes take their `path`s from here, and
 * whatever navigates takes a pattern (no parameter) or one of the builders in `paths`
 * below. **No path literal anywhere else.**
 *
 * The patterns are absolute, also for a nested route: the tree says who is whose parent,
 * this says what the address bar shows.
 */
export const ROUTES = {
    login: "/login",
    // The root shows the client list, as `/clients` does.
    root: "/",

    clients: "/clients",
    clientNew: "/clients/new",
    client: "/client/:clientId",
    clientEdit: "/client/:clientId/edit",
    // One image on one client, by id -- the page a row of the client's image list opens.
    clientImage: "/client/:clientId/image-id/:imageId",

    projects: "/projects",
    projectNew: "/projects/new",
    project: "/project/:projectId",
    projectEdit: "/project/:projectId/edit",

    containers: "/containers",
    container: "/container/:containerId",
    // One container on one client -- the page a client row of the container lists opens.
    containerInstance: "/client/:clientId/container/:containerName",

    images: "/images",
    image: "/image/:imageId",
    // One image reference on one client -- the page a row of an image's image list opens.
    imageInstance: "/client/:clientId/image/:imageRef",

    activity: "/activity",
    users: "/users",
    tokens: "/tokens",

    webhooks: "/webhooks",
    webhookNew: "/webhooks/new",
    webhook: "/webhooks/:webhookId",

    settings: "/settings",
} as const;

/**
 * The patterns with their parameters filled in. A pattern without one is used as it is.
 * `generatePath` encodes every parameter, so an image reference with its slashes and a
 * container group's `name||image` id are passed as they are.
 */
export const paths = {
    client: (clientId: string) => generatePath(ROUTES.client, { clientId }),
    clientEdit: (clientId: string) => generatePath(ROUTES.clientEdit, { clientId }),
    clientImage: (clientId: string, imageId: string) =>
        generatePath(ROUTES.clientImage, { clientId, imageId }),

    project: (projectId: string) => generatePath(ROUTES.project, { projectId }),
    projectEdit: (projectId: string) => generatePath(ROUTES.projectEdit, { projectId }),

    container: (containerId: string) => generatePath(ROUTES.container, { containerId }),
    containerInstance: (clientId: string, containerName: string) =>
        generatePath(ROUTES.containerInstance, { clientId, containerName }),

    image: (imageId: string) => generatePath(ROUTES.image, { imageId }),
    imageInstance: (clientId: string, imageRef: string) =>
        generatePath(ROUTES.imageInstance, { clientId, imageRef }),

    webhook: (webhookId: string) => generatePath(ROUTES.webhook, { webhookId }),
};

/** The tabs of the client page, in the order the arrow keys walk them. The first is the default. */
export const CLIENT_TABS = ["containers", "images", "volumes", "networks"] as const;

export type ClientTab = (typeof CLIENT_TABS)[number];

/**
 * A client's page with one of its tabs open. Not among `paths`: the tab is the page's
 * query, not a pattern of its own -- but a link that names it must not spell it out either.
 */
export const clientTab = (clientId: string, tab: ClientTab) => ({
    pathname: paths.client(clientId),
    search: `?${new URLSearchParams({ tab })}`,
});
