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
    // No page of its own yet: the root leads to the client list.
    root: "/",

    clients: "/clients",
    clientNew: "/clients/new",
    client: "/clients/:clientId",
    clientEdit: "/clients/:clientId/edit",
    // One image on one client, by id -- the page a row of the client's image list opens,
    // and the only surface that does, so it lives below the client.
    clientImage: "/clients/:clientId/images/:imageId",

    projects: "/projects",
    projectNew: "/projects/new",
    project: "/projects/:projectId",
    projectEdit: "/projects/:projectId/edit",

    containers: "/containers",
    container: "/containers/:containerId",
    // One container on one client. Below the containers rather than the client: it is
    // opened from the container lists, and the area it sits in is the entry the sidebar
    // marks. Four segments, so it cannot be taken for a container's own page.
    containerInstance: "/containers/instances/:clientId/:containerName",

    images: "/images",
    image: "/images/:imageId",
    // One image reference on one client, below the images for the same reason.
    imageInstance: "/images/instances/:clientId/:imageRef",

    activity: "/activity",
    users: "/users",
    tokens: "/tokens",

    webhooks: "/webhooks",
    webhookNew: "/webhooks/new",
    webhook: "/webhooks/:webhookId",

    settings: "/settings",
} as const;

/**
 * The addresses the pages had before every area took the plural of its list, each with the
 * pattern that replaced it. The parameters keep their names, so a redirect fills the new
 * pattern with what the old one matched. Kept for one release, for bookmarks and for links
 * in notifications that were sent before the change.
 */
export const LEGACY_ROUTES: readonly { from: string; to: string }[] = [
    { from: "/client/:clientId", to: ROUTES.client },
    { from: "/client/:clientId/edit", to: ROUTES.clientEdit },
    { from: "/client/:clientId/image-id/:imageId", to: ROUTES.clientImage },
    { from: "/client/:clientId/container/:containerName", to: ROUTES.containerInstance },
    { from: "/client/:clientId/image/:imageRef", to: ROUTES.imageInstance },
    { from: "/project/:projectId", to: ROUTES.project },
    { from: "/project/:projectId/edit", to: ROUTES.projectEdit },
    { from: "/container/:containerId", to: ROUTES.container },
    { from: "/image/:imageId", to: ROUTES.image },
];

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

const GROUP_SEPARATOR = "||";

/**
 * The id of a container across all hosts, as `/containers/:containerId` carries it: the
 * container's name and the image it is configured with. Two containers that share a name
 * but run different images are two groups. Built and taken apart here and nowhere else.
 */
export const containerGroupId = (name: string, configImage: string): string =>
    `${name}${GROUP_SEPARATOR}${configImage}`;

/** The two halves of a {@link containerGroupId}. An id without the separator is all name. */
export function parseContainerGroupId(id: string): { name: string; configImage: string } {
    const at = id.indexOf(GROUP_SEPARATOR);
    if (at < 0) return { name: id, configImage: "" };
    return { name: id.slice(0, at), configImage: id.slice(at + GROUP_SEPARATOR.length) };
}

/**
 * The id of one host's row below a container group in the list: the group and the client.
 * Never part of an address -- but it is made of the same separator, so it is made here.
 */
export const containerInstanceNodeId = (groupId: string, clientId: string): string =>
    `${groupId}${GROUP_SEPARATOR}${clientId}`;
