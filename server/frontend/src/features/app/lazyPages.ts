import { lazy } from "react";

// Page components -- loaded on demand, so a chunk only arrives when its route does.
// A `.ts` file of its own: the route files next to it export route elements and the
// tree, and Fast Refresh wants a file to export components or other things, not both.
export const DashboardOverview = lazy(() =>
    import("../dashboard/components/DashboardOverview").then((m) => ({ default: m.DashboardOverview })),
);
export const ManagedClients = lazy(() =>
    import("../clients/components/ManagedClients").then((m) => ({ default: m.ManagedClients })),
);
export const ClientOverview = lazy(() =>
    import("../clients/components/ClientOverview").then((m) => ({ default: m.ClientOverview })),
);
export const ClientEditor = lazy(() =>
    import("../clients/components/ClientEditor").then((m) => ({ default: m.ClientEditor })),
);
export const AddClientWizard = lazy(() =>
    import("../clients/components/add-client/AddClientWizard").then((m) => ({
        default: m.AddClientWizard,
    })),
);
export const ManagedContainers = lazy(() =>
    import("../containers/components/ManagedContainers").then((m) => ({ default: m.ManagedContainers })),
);
export const ContainerOverview = lazy(() =>
    import("../containers/components/ContainerOverview").then((m) => ({ default: m.ContainerOverview })),
);
export const ContainerInstanceOverview = lazy(() =>
    import("../containers/components/ContainerInstanceOverview").then((m) => ({
        default: m.ContainerInstanceOverview,
    })),
);
export const ManagedProjects = lazy(() =>
    import("../projects/components/ManagedProjects").then((m) => ({ default: m.ManagedProjects })),
);
export const ProjectEditor = lazy(() =>
    import("../projects/components/ProjectEditor").then((m) => ({ default: m.ProjectEditor })),
);
export const ProjectOverview = lazy(() =>
    import("../projects/components/ProjectOverview").then((m) => ({ default: m.ProjectOverview })),
);
export const ManagedImages = lazy(() =>
    import("../images/components/ManagedImages").then((m) => ({ default: m.ManagedImages })),
);
export const ImageOverview = lazy(() =>
    import("../images/components/ImageOverview").then((m) => ({ default: m.ImageOverview })),
);
export const ImageInstanceOverview = lazy(() =>
    import("../images/components/ImageInstanceOverview").then((m) => ({
        default: m.ImageInstanceOverview,
    })),
);
export const ClientImageOverview = lazy(() =>
    import("../images/components/ClientImageOverview").then((m) => ({
        default: m.ClientImageOverview,
    })),
);
export const ActivityView = lazy(() =>
    import("../activity/components/ActivityView").then((m) => ({ default: m.ActivityView })),
);
export const UserOverview = lazy(() =>
    import("../users/components/UserOverview").then((m) => ({ default: m.UserOverview })),
);
export const TokenOverview = lazy(() =>
    import("../tokens/components/TokenOverview").then((m) => ({ default: m.TokenOverview })),
);
export const WebhookOverview = lazy(() =>
    import("../webhooks/components/WebhookOverview").then((m) => ({ default: m.WebhookOverview })),
);
export const WebhookEditorRoute = lazy(() =>
    import("../webhooks/components/WebhookEditor").then((m) => ({ default: m.WebhookEditorRoute })),
);
export const Settings = lazy(() => import("../../pages/Settings"));
