import { Suspense, useEffect, useMemo } from "react";
import { Outlet, useLocation, useMatches, useNavigate } from "react-router-dom";
import {
    ConnectionBanner,
    Dashboard,
    DashboardNavGroup,
    DashboardPage,
    LoadingIndicator,
    StatusDotProvider,
} from "@stefgo/react-ui-components";
import { Ellipsis } from "lucide-react";

import { useTheme } from "./context/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { useWebSocket } from "./context/WebSocketContext";
import { BreadcrumbContext } from "./context/BreadcrumbContext";
import { navEntries, type RouteHandle } from "./routes";
import { breadcrumb } from "../../lib/breadcrumb";
import { APP_NAME, routeTitle, type TitleSubject } from "../../lib/pageTitle";
import { parseContainerGroupId, paths } from "../../lib/paths";
import { clientName } from "../../utils";

// Hooks, queries & stores
import { useUIStore } from "../../stores/useUIStore";
import { unseenTone } from "../activity/lib/unseenTone";
import { containerPath } from "../containers/containerState";
import { useContainersData } from "../containers/hooks/useContainersData";
import { clientCount, formatOnlineCount, updatesAvailable } from "../dashboard/lib/dashboard";
import { useActivity } from "../../queries/activity";
import { useClients } from "../../queries/clients";
import { findProject, useProjects } from "../../queries/projects";
import { useAutoUpdateRunToasts } from "../containers/hooks/useAutoUpdateRunToasts";
import { useSearchHotkey } from "../../hooks/useSearchHotkey";

type PageNav = NonNullable<DashboardPage["nav"]>;

const NAV_GROUPS: DashboardNavGroup[] = [
    { id: "overview" },
    { id: "resources", title: "Resources" },
    { id: "activity" },
    { id: "admin", title: "Administration" },
];

/** The dashboard shell around every page behind the login. The page itself is the outlet. */
export function AppLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // The area the open route belongs to -- the innermost match that carries a sidebar
    // entry. This is what marks the entry while an editor or a detail view is open.
    const matches = useMatches();
    const activeId = matches
        .map((match) => (match.handle as RouteHandle | undefined)?.nav?.id)
        .filter(Boolean)
        .pop();

    const { theme, toggleTheme } = useTheme();
    const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

    // An auto-update somebody asked for reports minutes later, long after the list it was
    // started from may have been left. The shell is what is still there to say so.
    useAutoUpdateRunToasts();
    useSearchHotkey();

    // Nothing here polls: once the socket is gone for good, what is on screen is a
    // snapshot. The banner says so, and the dots stop pulsing as if somebody still watched.
    const isLost = useWebSocket()?.isLost ?? false;

    // Activity. The badge only signals that something needs a look: red for an unseen error,
    // yellow for an unseen warning, nothing otherwise.
    const events = useActivity();
    const activityTone = useMemo(() => unseenTone(events) ?? undefined, [events]);

    // The shell needs the clients for the sidebar badge; the pages read their own data.
    const { clients } = useClients();
    // Counted by the functions the overview's cards use, so the two cannot disagree.
    const clientsBadge = useMemo(() => formatOnlineCount(clientCount(clients)), [clients]);

    // The containers a newer image waits for. No badge at zero: it would only say "fine".
    const containerGroups = useContainersData();
    const updates = useMemo(() => updatesAvailable(containerGroups), [containerGroups]);

    // The browser tab names the area and what is open in it, and the breadcrumb in the
    // page's header spells the same out as links. Here rather than in each page: the route tree says
    // what a page is. A client and a project are called by the name their list holds; a
    // container and an image are named by the address itself.
    const { projects } = useProjects();
    const { title, crumbs } = useMemo(() => {
        const { clientId, projectId, containerId, containerName, imageId, imageRef } =
            matches[matches.length - 1]?.params ?? {};
        const nameOf = (subject: TitleSubject) => {
            switch (subject) {
                case "client": {
                    const client = clients.find((c) => c.id === clientId);
                    return client && clientName(client);
                }
                case "project":
                    return findProject(projects, projectId)?.name;
                case "container":
                    return containerName ?? (containerId && parseContainerGroupId(containerId).name);
                case "image":
                    return imageRef ?? imageId;
            }
        };
        // Where an instance page's subject lives across all hosts -- what such a page calls
        // "back". A container's group is keyed by its image too, so it has to be looked up.
        const pathOf = (subject: TitleSubject) => {
            switch (subject) {
                case "container": {
                    const group = containerGroups.find((g) =>
                        g.children?.some((c) => c.clientId === clientId && c.containerName === containerName),
                    );
                    return group && containerPath(group);
                }
                case "image":
                    return imageRef && paths.image(imageRef);
                default:
                    return undefined;
            }
        };
        const handles = matches.map((match) => match.handle as RouteHandle | undefined);
        return {
            title: routeTitle(handles, nameOf),
            crumbs: breadcrumb(
                matches.map(({ pathname }, i) => ({ pathname, handle: handles[i] })),
                { nameOf, pathOf },
            ),
        };
    }, [matches, clients, projects, containerGroups]);

    // Taken back when the shell goes: the login page behind a logout is not the page
    // that was open before it.
    useEffect(() => {
        document.title = title;
        return () => {
            document.title = APP_NAME;
        };
    }, [title]);

    // The name comes from /api/v1/me; the page used to decode it out of the JWT, which
    // lives in an httpOnly cookie now.
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

    const brand = (
        <div className="flex flex-col">
            <h1 className="text-xl font-bold text-text-primary leading-tight">
                D<span className="text-primary">I</span>M
            </h1>
            <span className="pt-1 text-[10px] font-mono text-text-muted -mt-1 leading-none">
                {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0"}
            </span>
        </div>
    );

    // Navigation only -- the route tree decides what is rendered, and which entries exist.
    // What is added here is what only the running application knows.
    const pages: DashboardPage[] = useMemo(() => {
        const live: Record<string, Partial<PageNav>> = {
            clients: { badge: clientsBadge },
            containers: updates > 0 ? { badge: String(updates) } : {},
            activity: { badgeDot: activityTone !== undefined, badgeTone: activityTone },
        };

        return navEntries.map(({ id, path, ...entry }) => ({
            id,
            active: id === activeId,
            nav: { ...entry, ...live[id], onClick: () => navigate(path) },
        }));
    }, [clientsBadge, updates, activityTone, navigate, activeId]);

    return (
        <StatusDotProvider live={!isLost}>
            <Dashboard
                logo={logo}
                title={brand}
                username={username}
                onLogout={logout}
                theme={theme}
                onToggleTheme={toggleTheme}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={toggleSidebarCollapsed}
                pages={pages}
                navGroups={NAV_GROUPS}
                currentPath={pathname}
                // Seven icons in a row are not a navigation one can read; the name under
                // each is.
                bottomNavLabels
                // Six names fit a phone's width, seven do not: Images sits behind "More"
                // with the administration, which makes the sheet more than a settings menu.
                mobileMore={{ icon: Ellipsis, title: "More" }}
                banner={<ConnectionBanner connected={!isLost} />}
            >
                <BreadcrumbContext.Provider value={crumbs}>
                    <Suspense fallback={<LoadingIndicator />}>
                        <Outlet />
                    </Suspense>
                </BreadcrumbContext.Provider>
            </Dashboard>
        </StatusDotProvider>
    );
}
