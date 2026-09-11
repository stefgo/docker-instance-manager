import { ReactNode, Suspense, lazy, useMemo, useEffect } from "react";
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    useNavigate,
    useLocation,
    useParams,
} from "react-router-dom";
import { Monitor, Key, Users, Settings as SettingsIcon, Layers, Box, Bell } from "lucide-react";

// Library Components
import { Button, Card, Dashboard, DashboardPage, DashboardNavGroup } from "@stefgo/react-ui-components";
import { CLIENT_STATUS } from "@dim/shared";

import Login from "../../pages/Login";
import { useTheme } from "./context/ThemeContext";
import { ThemeProvider } from "./context/ThemeProvider";
import { useAuth } from "../auth/AuthContext";
import { AuthProvider } from "../auth/AuthProvider";
import { WebSocketProvider } from "./context/WebSocketProvider";

// Hooks & Stores
import { useClientStore } from "../../stores/useClientStore";
import { useUIStore } from "../../stores/useUIStore";
import { useNotificationStore } from "../../stores/useNotificationStore";

// Page components -- loaded on demand, so a chunk only arrives when its route does. The
// previous shape built the element tree of all nine pages on every render of the shell,
// although one of them was ever on screen.
const ManagedClients = lazy(() =>
    import("../clients/components/ManagedClients").then((m) => ({ default: m.ManagedClients })),
);
const ClientOverview = lazy(() =>
    import("../clients/components/ClientOverview").then((m) => ({ default: m.ClientOverview })),
);
const ManagedContainers = lazy(() =>
    import("../containers/components/ManagedContainers").then((m) => ({ default: m.ManagedContainers })),
);
const ManagedImages = lazy(() =>
    import("../images/components/ManagedImages").then((m) => ({ default: m.ManagedImages })),
);
const ImageOverview = lazy(() =>
    import("../images/components/ImageOverview").then((m) => ({ default: m.ImageOverview })),
);
const NotificationsView = lazy(() =>
    import("../notifications/components/NotificationsView").then((m) => ({ default: m.NotificationsView })),
);
const UserOverview = lazy(() =>
    import("../users/components/UserOverview").then((m) => ({ default: m.UserOverview })),
);
const TokenOverview = lazy(() =>
    import("../tokens/components/TokenOverview").then((m) => ({ default: m.TokenOverview })),
);
const Settings = lazy(() => import("../../pages/Settings"));

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

// ---------------------------------------------------------------------------
// Routes
//
// Each route takes what it needs from the stores itself. The shell used to hold
// the selected client for every page at once; now only the page that shows it does.
// ---------------------------------------------------------------------------

function ClientsRoute() {
    const navigate = useNavigate();
    const { clients, fetchClients, deleteClient, updateClient, createOutboundClient } =
        useClientStore();

    return (
        <ManagedClients
            clients={clients}
            onSelect={(c) => (c ? navigate(`/client/${c.id}`) : navigate("/"))}
            onRefresh={() => {
                fetchClients();
            }}
            onDelete={(id) => deleteClient(id)}
            onUpdate={(id, data) => updateClient(id, data)}
            onCreateOutbound={(data) => createOutboundClient(data)}
        />
    );
}

function ClientDetailRoute() {
    const { clientId } = useParams();
    const clients = useClientStore((s) => s.clients);
    const client = clients.find((c) => c.id === clientId);

    // No redirect on a miss: a link to a client arrives before the client list does, and
    // the list is what this showed until the store caught up.
    if (!client) return <ClientsRoute />;

    return <ClientOverview client={client} />;
}

function ImageDetailRoute() {
    // An id that matches no image is the image page's own case -- it says so instead of
    // sending the visitor somewhere else.
    const { imageId } = useParams();
    return <ImageOverview imageId={imageId} />;
}

function NotFound() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    return (
        <Card title="Page not found" padding="md" classNames={{ content: "space-y-4" }}>
            <p className="text-text-secondary">
                There is nothing at <code className="font-mono text-sm">{pathname}</code>.
            </p>
            <Button variant="secondary" onClick={() => navigate("/clients")}>
                Back to clients
            </Button>
        </Card>
    );
}

function AppLayout() {
    const { isAuthenticated, user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const { theme, toggleTheme } = useTheme();
    const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

    // Notifications
    const notifications = useNotificationStore((s) => s.notifications);
    const currentUserId = useNotificationStore((s) => s.currentUserId);
    const notificationsCount = currentUserId
        ? notifications.filter((n) => !n.seenBy.includes(currentUserId)).length
        : notifications.length;

    // Routing Helpers
    const path = location.pathname;

    // The shell needs the clients for the sidebar badge; the pages fetch their own data.
    const { clients, fetchClients } = useClientStore();

    useEffect(() => {
        if (isAuthenticated) {
            fetchClients();
        }
    }, [isAuthenticated, fetchClients]);

    // Stats
    const stats = useMemo(
        () => ({
            clients: {
                active: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
                total: clients.length,
            },
        }),
        [clients],
    );

    // Dashboard Props. The name comes from /api/v1/me; the page used to decode it out of
    // the JWT, which lives in an httpOnly cookie now.
    const username = user?.username ?? "User";

    const logo = (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white leading-none">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
            >
                <path d="M12 2L3 7l9 5 9-5-9-5z" />
                <path d="M3 12l9 5 9-5" />
                <path d="M3 17l9 5 9-5" />
                <path d="M3 7v10" />
                <path d="M12 12v10" />
                <path d="M21 7v10" />
            </svg>
        </div>
    );

    const title = (
        <div className="flex flex-col">
            <h1 className="text-xl font-bold text-text-primary leading-tight">
                D<span className="text-primary">I</span>M
            </h1>
            <span className="pt-1 text-[10px] font-mono text-text-muted -mt-1 leading-none">
                {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0"}
            </span>
        </div>
    );

    const navGroups: DashboardNavGroup[] = [
        { id: "resources", title: "Resources" },
        { id: "notification" },
        { id: "admin", title: "Administration" },
    ];

    // Navigation only. Since react-ui-components 3.0 the Dashboard does not decide what is
    // on screen; the routes below do, passed to it as children.
    const pages: DashboardPage[] = useMemo(
        () => [
            {
                id: "clients",
                path: ["/", "/clients", "/client/:clientId"],
                nav: {
                    groupId: "resources",
                    label: "Clients",
                    icon: Monitor,
                    badge: `${stats.clients.active} / ${stats.clients.total}`,
                    onClick: () => navigate("/clients"),
                },
            },
            {
                id: "containers",
                path: "/containers",
                nav: {
                    groupId: "resources",
                    label: "Container",
                    icon: Box,
                    onClick: () => navigate("/containers"),
                },
            },
            {
                id: "images",
                path: ["/images", "/image/:imageId"],
                nav: {
                    groupId: "resources",
                    label: "Images",
                    icon: Layers,
                    onClick: () => navigate("/images"),
                },
            },
            {
                id: "notifications",
                path: "/notifications",
                nav: {
                    groupId: "notification",
                    label: "Notifications",
                    icon: Bell,
                    badge: notificationsCount > 0 ? String(notificationsCount) : undefined,
                    badgeDot: notificationsCount > 0,
                    onClick: () => navigate("/notifications"),
                },
            },
            {
                id: "users",
                path: "/users",
                nav: {
                    groupId: "admin",
                    placement: "mobile-more",
                    label: "Users",
                    icon: Users,
                    onClick: () => navigate("/users"),
                },
            },
            {
                id: "tokens",
                path: "/tokens",
                nav: {
                    groupId: "admin",
                    placement: "mobile-more",
                    label: "Client Tokens",
                    icon: Key,
                    onClick: () => navigate("/tokens"),
                },
            },
            {
                id: "settings",
                path: "/settings",
                nav: {
                    groupId: "admin",
                    placement: "mobile-more",
                    label: "Settings",
                    icon: SettingsIcon,
                    onClick: () => navigate("/settings"),
                },
            },
        ],
        [stats, navigate, notificationsCount],
    );

    return (
        <Dashboard
            logo={logo}
            title={title}
            username={username}
            onLogout={logout}
            theme={theme}
            onToggleTheme={toggleTheme}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebarCollapsed}
            pages={pages}
            navGroups={navGroups}
            currentPath={path}
        >
            <Suspense fallback={<div className="p-6 text-text-muted">Loading…</div>}>
                <Routes>
                    <Route path="/" element={<ClientsRoute />} />
                    <Route path="/clients" element={<ClientsRoute />} />
                    <Route path="/client/:clientId" element={<ClientDetailRoute />} />
                    <Route path="/containers" element={<ManagedContainers />} />
                    <Route path="/images" element={<ManagedImages />} />
                    <Route path="/image/:imageId" element={<ImageDetailRoute />} />
                    <Route path="/notifications" element={<NotificationsView />} />
                    <Route path="/users" element={<UserOverview />} />
                    <Route path="/tokens" element={<TokenOverview />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Suspense>
        </Dashboard>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <WebSocketProvider>
                    <AppRoutes />
                </WebSocketProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

function AppRoutes() {
    const { isAuthenticated } = useAuth();
    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/login"
                    element={isAuthenticated ? <Navigate to="/" /> : <Login />}
                />
                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
