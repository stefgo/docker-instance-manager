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
import { Monitor, Key, Users, Settings as SettingsIcon, Layers } from "lucide-react";

// Library Components
import { Dashboard, DashboardPage } from "@stefgo/react-ui-components";

import Login from "../../pages/Login";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";

// Hooks & Stores
import { useClientStore } from "../../stores/useClientStore";
import { useUIStore } from "../../stores/useUIStore";

// Components
import { TokenOverview } from "../tokens/components/TokenOverview";
import { ManagedClients } from "../clients/components/ManagedClients";
import { ClientOverview } from "../clients/components/ClientOverview";
import { UserOverview } from "../users/components/UserOverview";
import Settings from "../../pages/Settings";
import { ImageOverview } from "../docker/components/ImageOverview";

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function AppLayout() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const matchClient = useMatch("/client/:clientId");

  const { theme, toggleTheme } = useTheme();
  const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

  // Routing Helpers
  const path = location.pathname;
  const isClients =
    path === "/" || path === "/clients" || path.startsWith("/client/");
  const isImages = path === "/images";

  // Client Store
  const { clients, fetchClients, deleteClient, updateClient } =
    useClientStore();
  const selectedClientId = matchClient?.params.clientId;
  const selectedClient = selectedClientId
    ? clients.find((c) => c.id === selectedClientId) || null
    : null;

  useEffect(() => {
    if (token) {
      fetchClients(token);
    }
  }, [token, fetchClients]);

  // Stats
  const stats = useMemo(
    () => ({
      clients: {
        active: clients.filter((c) => c.status === "online").length,
        total: clients.length,
      },
    }),
    [clients],
  );

  // Dashboard Props
  let username = "User";
  try {
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      username = payload.username || payload.email || "User";
    }
  } catch (e) {
    console.error("Failed to parse token", e);
  }

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
      <h1 className="text-xl font-bold text-text-primary dark:text-text-primary-dark leading-tight">
        D<span className="text-primary">I</span>M
      </h1>
      <span className="pt-1 text-[10px] font-mono text-text-muted dark:text-text-muted-dark -mt-1 leading-none">
        {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0"}
      </span>
    </div>
  );

  const pages: DashboardPage[] = useMemo(
    () => [
      {
        id: "clients",
        group: "Ressources",
        label: "Clients",
        icon: Monitor,
        badge: `${stats.clients.active} / ${stats.clients.total}`,
        active: isClients,
        onClick: () => navigate("/clients"),
        content: (
          <>
            {path.startsWith("/client/") && selectedClient ? (
              <ClientOverview client={selectedClient} />
            ) : (
              <ManagedClients
                clients={clients}
                onSelect={(c) =>
                  c ? navigate(`/client/${c.id}`) : navigate("/")
                }
                onRefresh={() => {
                  if (token) fetchClients(token);
                }}
                onDelete={(id) => {
                  if (token) deleteClient(id, token);
                }}
                onUpdate={(id, data) =>
                  token ? updateClient(id, data, token) : Promise.reject()
                }
              />
            )}
          </>
        ),
      },
      {
        id: "images",
        group: "Ressources",
        label: "Images",
        icon: Layers,
        active: isImages,
        onClick: () => navigate("/images"),
        content: <ImageOverview />,
      },
      {
        id: "users",
        group: "Administration",
        isMobileMoreMenu: true,
        label: "Benutzerverwaltung",
        icon: Users,
        onClick: () => navigate("/users"),
        content: <UserOverview />,
      },
      {
        id: "tokens",
        group: "Administration",
        isMobileMoreMenu: true,
        label: "Client Tokens",
        icon: Key,
        onClick: () => navigate("/tokens"),
        content: <TokenOverview />,
      },
      {
        id: "settings",
        group: "Administration",
        isMobileMoreMenu: true,
        label: "Einstellungen",
        icon: SettingsIcon,
        onClick: () => navigate("/settings"),
        content: <Settings />,
      },
    ],
    [
      path,
      isClients,
      isImages,
      selectedClient,
      clients,
      stats,
      token,
      navigate,
      fetchClients,
      deleteClient,
      updateClient,
    ],
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
    />
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
  const { token } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={token ? <Navigate to="/" /> : <Login />}
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
