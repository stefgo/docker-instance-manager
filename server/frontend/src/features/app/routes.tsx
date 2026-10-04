import { Navigate, type RouteObject } from "react-router-dom";
import { Activity, Box, Boxes, Key, Layers, Monitor, Settings as SettingsIcon, Users, Webhook } from "lucide-react";
import type { DashboardPage } from "@stefgo/react-ui-components";

import { LEGACY_ROUTES, ROUTES } from "../../lib/paths";
import { RouteError } from "./RouteError";
import {
    ActivityView,
    ManagedContainers,
    ManagedImages,
    ManagedProjects,
    ProjectEditor,
    Settings,
    TokenOverview,
    UserOverview,
    WebhookEditorRoute,
    WebhookOverview,
} from "./lazyPages";
import {
    AddClientRoute,
    ClientBoundary,
    ClientDetailRoute,
    ClientEditRoute,
    ClientImageRoute,
    ClientsRoute,
    ContainerDetailRoute,
    ContainerInstanceRoute,
    ImageDetailRoute,
    ImageInstanceRoute,
    LegacyRedirect,
    NotFound,
    ProjectDetailRoute,
    ProjectEditRoute,
} from "./routeElements";

type PageNav = NonNullable<DashboardPage["nav"]>;

/**
 * The part of a sidebar entry that is fixed: where it sits and what it is called. What
 * changes while the application runs -- the client count, the dot for unseen activity --
 * is added by `AppLayout`, by `id`.
 */
export interface NavEntry extends Pick<PageNav, "label" | "icon" | "groupId" | "placement"> {
    id: string;
}

/** What a route's `handle` may carry. The router types it as `any`; this is what is read. */
export interface RouteHandle {
    nav?: NavEntry;
}

const nav = (entry: NavEntry): RouteHandle => ({ nav: entry });

/**
 * Everything inside the dashboard shell, as one tree. It is the only description of what
 * lives where:
 *
 * - **Paths** come from `lib/paths.ts`, each used here exactly once.
 * - **The sidebar** is the areas that carry `handle.nav`, in this order. An entry is
 *   marked while any route below its area is open -- nothing lists those routes again.
 *   That is why an instance page sits below Containers or Images and not below its
 *   client: it is opened from their lists, and theirs is the entry to mark.
 * - **Not found and render errors** are the area's `errorElement`: the page is replaced,
 *   the shell around it stays.
 */
export const shellRoutes: RouteObject[] = [
    // No page of its own yet: the root is the client list.
    { path: ROUTES.root, element: <Navigate to={ROUTES.clients} replace /> },
    {
        path: ROUTES.clients,
        handle: nav({ id: "clients", groupId: "resources", label: "Clients", icon: Monitor }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ClientsRoute /> },
            { path: ROUTES.clientNew, element: <AddClientRoute /> },
            {
                path: ROUTES.client,
                element: <ClientBoundary />,
                children: [
                    { index: true, element: <ClientDetailRoute /> },
                    { path: ROUTES.clientEdit, element: <ClientEditRoute /> },
                    { path: ROUTES.clientImage, element: <ClientImageRoute /> },
                ],
            },
        ],
    },
    {
        path: ROUTES.projects,
        handle: nav({ id: "projects", groupId: "resources", label: "Projects", icon: Boxes }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ManagedProjects /> },
            { path: ROUTES.projectNew, element: <ProjectEditor /> },
            {
                path: ROUTES.project,
                children: [
                    { index: true, element: <ProjectDetailRoute /> },
                    { path: ROUTES.projectEdit, element: <ProjectEditRoute /> },
                ],
            },
        ],
    },
    {
        path: ROUTES.containers,
        handle: nav({ id: "containers", groupId: "resources", label: "Containers", icon: Box }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ManagedContainers /> },
            { path: ROUTES.containerInstance, element: <ContainerInstanceRoute /> },
            { path: ROUTES.container, element: <ContainerDetailRoute /> },
        ],
    },
    {
        path: ROUTES.images,
        handle: nav({ id: "images", groupId: "resources", label: "Images", icon: Layers }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ManagedImages /> },
            { path: ROUTES.imageInstance, element: <ImageInstanceRoute /> },
            { path: ROUTES.image, element: <ImageDetailRoute /> },
        ],
    },
    {
        path: ROUTES.activity,
        handle: nav({ id: "activity", groupId: "activity", label: "Activity", icon: Activity }),
        errorElement: <RouteError />,
        element: <ActivityView />,
    },
    {
        path: ROUTES.users,
        handle: nav({ id: "users", groupId: "admin", placement: "mobile-more", label: "Users", icon: Users }),
        errorElement: <RouteError />,
        element: <UserOverview />,
    },
    {
        path: ROUTES.tokens,
        handle: nav({ id: "tokens", groupId: "admin", placement: "mobile-more", label: "Client Tokens", icon: Key }),
        errorElement: <RouteError />,
        element: <TokenOverview />,
    },
    {
        path: ROUTES.webhooks,
        handle: nav({ id: "webhooks", groupId: "admin", placement: "mobile-more", label: "Webhooks", icon: Webhook }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <WebhookOverview /> },
            { path: ROUTES.webhookNew, element: <WebhookEditorRoute /> },
            { path: ROUTES.webhook, element: <WebhookEditorRoute /> },
        ],
    },
    {
        path: ROUTES.settings,
        handle: nav({ id: "settings", groupId: "admin", placement: "mobile-more", label: "Settings", icon: SettingsIcon }),
        errorElement: <RouteError />,
        element: <Settings />,
    },
    ...LEGACY_ROUTES.map(({ from, to }) => ({ path: from, element: <LegacyRedirect to={to} /> })),
    { path: "*", element: <NotFound /> },
];

/** The sidebar entries, read off the tree: every area with a `handle.nav`, and its path. */
export const navEntries = shellRoutes.flatMap((route) => {
    const entry = (route.handle as RouteHandle | undefined)?.nav;
    return entry && route.path ? [{ ...entry, path: route.path }] : [];
});
