import { ReactNode } from "react";
import { Navigate, Outlet, generatePath, useLocation, useNavigate, useParams } from "react-router-dom";
import { LoadingIndicator } from "@stefgo/react-ui-components";
import type { Client } from "@dim/shared";

import Login from "../../pages/Login";
import { NotFoundCard } from "../../components/NotFoundCard";
import { useAuth } from "../auth/AuthContext";
import { NotFoundError } from "../../lib/notFound";
import { ROUTES, paths } from "../../lib/paths";
import {
    useClient,
    useClients,
    useCreateOutboundClient,
    useDeleteClient,
    useUpdateClient,
} from "../../queries/clients";
import { useRouteClient } from "./routeContext";
import {
    AddClientWizard,
    ClientEditor,
    ClientImageOverview,
    ClientOverview,
    ContainerInstanceOverview,
    ContainerOverview,
    ImageInstanceOverview,
    ImageOverview,
    ManagedClients,
    ProjectEditor,
    ProjectOverview,
} from "./lazyPages";

// ---------------------------------------------------------------------------
// What the route tree in `routes.tsx` renders. Each element pulls what it needs
// from the query cache itself; none of them knows a path -- those come from
// `lib/paths.ts`.
// ---------------------------------------------------------------------------

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to={ROUTES.login} replace />;
    }
    return <>{children}</>;
}

export function LoginRoute() {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <Navigate to={ROUTES.root} /> : <Login />;
}

export function NotFound() {
    const { pathname } = useLocation();

    return (
        <NotFoundCard title="Page not found" backTo={ROUTES.clients} backLabel="Back to clients">
            There is nothing at <code className="font-mono text-sm">{pathname}</code>.
        </NotFoundCard>
    );
}

/**
 * An address from before the areas took one URL scheme (`LEGACY_ROUTES`), sent on to the
 * pattern that replaced it. The parameters keep their names; query and fragment travel
 * along, and the old address leaves the history.
 */
export function LegacyRedirect({ to }: { to: string }) {
    const params = useParams();
    const { search, hash } = useLocation();
    const pathname = generatePath(to, params as Record<string, string>);

    return <Navigate to={{ pathname, search, hash }} replace />;
}

// --- Clients ---------------------------------------------------------------

export function ClientsRoute() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { clients, refetch } = useClients();
    // Optimistic: the row goes at once and comes back if the server refuses.
    const { mutateAsync: deleteClient } = useDeleteClient();

    // Every editor route knows where back is because the surface that opened it says so.
    const open = (to: string) => navigate(to, { state: { from: pathname } });

    return (
        <ManagedClients
            clients={clients}
            onSelect={(c) => navigate(c ? paths.client(c.id) : ROUTES.clients)}
            onRefresh={() => {
                void refetch();
            }}
            onDelete={(id) => deleteClient(id)}
            onAdd={() => open(ROUTES.clientNew)}
            onEdit={(c) => open(paths.clientEdit(c.id))}
        />
    );
}

export function AddClientRoute() {
    const navigate = useNavigate();
    const { state } = useLocation();
    const { refetch } = useClients();
    const { mutateAsync: createOutboundClient } = useCreateOutboundClient();
    const back = (state as { from?: string } | null)?.from ?? ROUTES.clients;

    return (
        <AddClientWizard
            onClose={() => navigate(back)}
            onCreateOutbound={(data) => createOutboundClient(data)}
            onTokenCreated={() => {
                void refetch();
            }}
        />
    );
}

/**
 * The layout route at `/clients/:clientId`: resolves the client once for everything below
 * it and hands it down as the outlet context (`useRouteClient`).
 *
 * The client comes from the cached list. While that is pending this shows the spinner: a
 * reloaded or shared URL renders before the first fetch returns, and an empty list then
 * says nothing about whether the client exists. Only after that is a missing client
 * really gone -- a stale bookmark or a deleted client gets the not-found card, and the URL
 * stays where it was. The routes used to show the client list in both cases, under an
 * address that named a client.
 */
export function ClientBoundary() {
    const { clientId } = useParams();
    const { isPending } = useClients();
    const client = useClient(clientId);

    if (!client) {
        if (isPending) return <LoadingIndicator label="Loading client…" />;
        throw new NotFoundError("client");
    }
    return <Outlet context={client satisfies Client} />;
}

export function ClientDetailRoute() {
    return <ClientOverview client={useRouteClient()} />;
}

export function ClientEditRoute() {
    const client = useRouteClient();
    // Optimistic: the list shows the change at once and takes it back if the server refuses.
    const { mutateAsync: updateClient } = useUpdateClient();

    return <ClientEditor client={client} onSave={(clientId, data) => updateClient({ clientId, data })} />;
}

export function ClientImageRoute() {
    // Addressed by id, so an untagged image has a page too. An id the host does not list is
    // the page's own case.
    const { imageId } = useParams();
    return <ClientImageOverview clientId={useRouteClient().id} imageId={imageId} />;
}

// --- Projects --------------------------------------------------------------

export function ProjectDetailRoute() {
    // An id that is not managed is the project page's own case -- it says so instead of
    // sending the visitor somewhere else.
    const { projectId } = useParams();
    return <ProjectOverview id={projectId} />;
}

export function ProjectEditRoute() {
    const { projectId } = useParams();
    // Keyed by id, so switching between two edit pages starts from a fresh form.
    return <ProjectEditor key={projectId} projectId={projectId ?? ""} />;
}

// --- Containers ------------------------------------------------------------

export function ContainerDetailRoute() {
    // An id that matches no container is the container page's own case -- it says so instead
    // of sending the visitor somewhere else.
    const { containerId } = useParams();
    return <ContainerOverview containerId={containerId} />;
}

export function ContainerInstanceRoute() {
    // One container on one host; a pair that matches nothing is the page's own case too.
    const { clientId, containerName } = useParams();
    return <ContainerInstanceOverview clientId={clientId} containerName={containerName} />;
}

// --- Images ----------------------------------------------------------------

export function ImageDetailRoute() {
    // An id that matches no image is the image page's own case -- it says so instead of
    // sending the visitor somewhere else.
    const { imageId } = useParams();
    return <ImageOverview imageId={imageId} />;
}

export function ImageInstanceRoute() {
    // Addressed by reference rather than id: a pull moves the tag to another image, and the
    // page follows it there. A pair that matches nothing is the page's own case.
    const { clientId, imageRef } = useParams();
    return <ImageInstanceOverview clientId={clientId} imageRef={imageRef} />;
}
