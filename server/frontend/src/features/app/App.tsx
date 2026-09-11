import { ReactNode, useMemo, useEffect } from "react";
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    useNavigate,
    useLocation,
    useMatch,
} from "react-router-dom";
import { Monitor, Key, Users, Settings as SettingsIcon, Layers, Box, Bell } from "lucide-react";

// Library Components
import { Dashboard, DashboardPage, DashboardNavGroup } from "@stefgo/react-ui-components";
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

// Components
import { TokenOverview } from "../tokens/components/TokenOverview";
import { ManagedClients } from "../clients/components/ManagedClients";
import { ClientOverview } from "../clients/components/ClientOverview";
import { UserOverview } from "../users/components/UserOverview";
import { ManagedImages } from "../images/components/ManagedImages";
import { ImageOverview } from "../images/components/ImageOverview";
import { ManagedContainers } from "../containers/components/ManagedContainers";
import Settings from "../../pages/Settings";

import { useNotificationStore } from "../../stores/useNotificationStore";
import { NotificationsView } from "../notifications/components/NotificationsView";

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

function AppLayout() {
    const { isAuthenticated, user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const matchClient = useMatch("/client/:clientId");
    const matchImage = useMatch("/image/:imageId");

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

    // Client Store
    const { clients, fetchClients, deleteClient, updateClient, createOutboundClient } =
        useClientStore();
    const selectedClientId = matchClient?.params.clientId;
    const selectedClient = selectedClientId
        ? clients.find((c) => c.id === selectedClientId) || null
        : null;

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

    const clientsPage = (
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
            <Routes>
                <Route path="/" element={clientsPage} />
                <Route path="/clients" element={clientsPage} />
                <Route
                    path="/client/:clientId"
                    element={selectedClient ? <ClientOverview client={selectedClient} /> : clientsPage}
                />
                <Route path="/containers" element={<ManagedContainers />} />
                <Route path="/images" element={<ManagedImages />} />
                <Route
                    path="/image/:imageId"
                    element={<ImageOverview imageId={matchImage?.params.imageId} />}
                />
                <Route path="/notifications" element={<NotificationsView />} />
                <Route path="/users" element={<UserOverview />} />
                <Route path="/tokens" element={<TokenOverview />} />
                <Route path="/settings" element={<Settings />} />
                {/* The Dashboard no longer falls back to its first page for a path no page
                    claims, so the fallback it used to provide is spelled out here. */}
                <Route path="*" element={clientsPage} />
            </Routes>
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
