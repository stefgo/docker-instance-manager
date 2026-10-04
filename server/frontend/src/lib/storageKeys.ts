/**
 * Every key the application writes to the browser's storage, once. **No key literal
 * anywhere else**: a key spelled in a component is one nobody finds again, and the names
 * had grown into three schemes that way.
 *
 * A key reads `dim.<area>.<what>`. `<area>` is the page or list that owns the value, so
 * the keys of one page sort together in the browser's storage panel; the prefix keeps
 * them apart from whatever else is served from the same origin.
 *
 * Renaming a key forgets what was stored under the old one. That is the whole cost --
 * every value here is a preference that is set again with one click -- so a rename needs
 * no migration, only a line in the upgrade notes.
 */
export const STORAGE_KEYS = {
    // The shell.
    theme: "dim.app.theme",
    ui: "dim.app.ui",
    /** Session storage: when the page last reloaded itself for a chunk that was gone. */
    chunkReloadAt: "dim.app.chunkReloadAt",

    // Lists: table or cards.
    clientsView: "dim.clients.view",
    projectsView: "dim.projects.view",
    containersView: "dim.containers.view",
    imagesView: "dim.images.view",
    usersView: "dim.users.view",
    tokensView: "dim.tokens.view",
    webhooksView: "dim.webhooks.view",
    activityView: "dim.activity.view",

    // A client's page: its header, its four tabs and the activity below two of them.
    clientDetails: "dim.client.details",
    clientContainersView: "dim.client.containersView",
    clientImagesView: "dim.client.imagesView",
    clientVolumesView: "dim.client.volumesView",
    clientNetworksView: "dim.client.networksView",
    clientContainersActivityView: "dim.client.containersActivityView",
    clientImagesActivityView: "dim.client.imagesActivityView",

    projectDetails: "dim.project.details",
    projectActivityView: "dim.project.activityView",

    containerDetails: "dim.container.details",
    containerInstancesView: "dim.container.instancesView",
    containerActivityView: "dim.container.activityView",
    containerInstanceDetails: "dim.containerInstance.details",
    containerInstanceActivityView: "dim.containerInstance.activityView",

    imageDetails: "dim.image.details",
    imageImagesView: "dim.image.imagesView",
    imageContainersView: "dim.image.containersView",
    imageActivityView: "dim.image.activityView",
    imageInstanceDetails: "dim.imageInstance.details",
    imageInstanceActivityView: "dim.imageInstance.activityView",
    clientImageDetails: "dim.clientImage.details",
    clientImageActivityView: "dim.clientImage.activityView",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
