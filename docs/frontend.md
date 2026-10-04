This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/
│   ├── app/                              # Application shell
│   │   ├── App.tsx                       # The providers around the router
│   │   ├── router.tsx                    # createBrowserRouter: /login, and the shell behind the session
│   │   ├── routes.tsx                    # The route tree: paths, sidebar entries, titles, breadcrumb, error elements
│   │   ├── routeElements.tsx             # What the tree renders; ClientBoundary, the legacy redirects
│   │   ├── routeContext.ts               # useRouteClient: the client a route below /clients/:clientId is about
│   │   ├── lazyPages.ts                  # The page components, loaded on demand
│   │   ├── AppLayout.tsx                 # The dashboard shell; the page is its Outlet
│   │   ├── HeaderBreadcrumb.tsx          # The trail as the heading of a page's first card
│   │   ├── RouteError.tsx                # The areas' errorElement: not-found card or the error itself
│   │   └── context/
│   │       ├── WebSocketContext.ts       # WebSocket context object and useWebSocket hook
│   │       └── WebSocketProvider.tsx     # WebSocket connection for real-time updates
│   ├── auth/
│   │   ├── AuthContext.ts                # Auth context object and useAuth hook
│   │   └── AuthProvider.tsx              # Authentication state
│   ├── dashboard/                        # The overview at /
│   │   ├── lib/dashboard.ts              # The counts the cards and the sidebar badges both show (pure)
│   │   └── components/DashboardOverview.tsx # One StatCard per count, each the way to its list; "Needs attention" below
│   ├── clients/                          # Client management
│   │   ├── confirmations.ts              # Remove, delete-client and discard texts
│   │   ├── dockerRemove.ts               # The actions that ask before they are sent
│   │   ├── onlineTone.ts                 # The StatusDot tone of something that is live or not
│   │   └── components/
│   │       ├── ManagedClients.tsx        # Container for client list & actions
│   │       ├── ClientList.tsx            # Paginated client data table
│   │       ├── ClientOverview.tsx        # Detail view for a single client (tabs)
│   │       ├── ClientIdentityCard.tsx    # The client's own fields, edited and saved in place
│   │       ├── ClientEditor.tsx          # Form for editing a client
│   │       ├── ClientLabel.tsx           # Dot and name of a client, for the rows that name one
│   │       ├── ClientContainerList.tsx   # Containers tab in ClientOverview
│   │       ├── ClientImageList.tsx       # Images tab in ClientOverview
│   │       ├── ClientVolumeList.tsx      # Volumes tab in ClientOverview
│   │       ├── ClientNetworkList.tsx     # Networks tab in ClientOverview
│   │       └── add-client/               # One wizard for both connection modes
│   │           ├── AddClientWizard.tsx   # Mode choice, then the inbound or outbound branch
│   │           ├── useAddClientForm.ts   # Form state, held above the wizard
│   │           └── steps/                # StepConnectionMode, StepInboundDetails, StepOutboundDetails
│   ├── containers/                       # Cross-client container view
│   │   ├── activityFilter.ts             # Which activity events belong to a container page
│   │   ├── autoUpdate.ts                 # Why a container takes part: label, project, or not at all
│   │   ├── confirmations.ts              # Remove-container text
│   │   ├── containerState.ts             # State dot tones and the page path of a row
│   │   ├── instanceDetails.tsx           # The client, container and image groups of the instance pages
│   │   ├── components/
│   │   │   ├── ManagedContainers.tsx     # Tree-grouped containers with filters and per-row actions
│   │   │   ├── ContainerOverview.tsx     # Detail view of one container and its instances
│   │   │   ├── ContainerInstanceOverview.tsx # One instance: the container on one client, with its activity
│   │   │   ├── ContainerStatus.tsx       # The docker-ps status text, derived and kept counting
│   │   │   └── AutoUpdateSourceCell.tsx  # Renders that reading, shared by both container lists
│   │   ├── lib/
│   │   │   ├── containerGroups.ts        # Every container of the fleet, grouped by name and image (pure)
│   │   │   └── filterContainers.ts       # Search and the state and update filters, on host rows (pure)
│   │   └── hooks/
│   │       ├── useContainersData.ts      # Reads the cache and calls buildContainerGroups
│   │       ├── useContainerActions.ts    # Check, pull, start, stop, remove and their menu entries
│   │       ├── useAutoUpdateRuns.ts      # The newest autoupdate.run event per client
│   │       └── useAutoUpdateRunToasts.ts # Speaks for a run from the shell, minutes later
│   ├── images/                           # Cross-client image view
│   │   ├── activityFilter.ts             # Which events belong to an image page on one or all clients
│   │   ├── confirmations.ts              # Pull and prune texts, shared by every list that pulls
│   │   ├── components/
│   │   │   ├── ManagedImages.tsx         # Repository → Tag → Digest tree view
│   │   │   ├── ImageRepositoryList.tsx   # Repository-level rows
│   │   │   ├── ImageList.tsx             # Per-tag rows
│   │   │   ├── ImageContainerList.tsx    # Containers using a tag
│   │   │   ├── ImageOverview.tsx         # Detail view with stats and tables
│   │   │   ├── ImageInstanceOverview.tsx # One reference on one client, its containers and activity
│   │   │   ├── ClientImageOverview.tsx   # One image on one client by id: header and activity
│   │   │   ├── CheckLabel.tsx            # "Check for updates" of a list header; "Check" on a phone
│   │   │   └── UpdateIcon.tsx            # Update status: glyph, tooltip and accessible name
│   │   ├── hooks/
│   │   │   ├── useImagesData.ts          # Reads the cache and calls buildImageTree
│   │   │   └── useImageNodeActions.ts    # Check and pull for a node -- list rows and page alike
│   │   └── lib/
│   │       ├── digest.ts                 # Digest, image-id and reference normalisation, "is a check running"
│   │       ├── imageTree.ts              # The repository → tag → digest tree of the fleet (pure)
│   │       ├── updateStatus.ts           # What a registry check says about an image, the worst of several, its name
│   │       └── nodeStatus.ts             # What a tree node allows: check, pull, recreate
│   ├── projects/                         # Query-defined container groups as a management unit
│   │   ├── confirmations.ts              # Remove-project text
│   │   ├── query.ts                      # Labels, suggestions and the readable form of a query
│   │   ├── components/
│   │   │   ├── ManagedProjects.tsx       # List, update column and actions, edit and delete
│   │   │   ├── ProjectEditor.tsx         # Create/edit: name, query, auto-update, live result
│   │   │   ├── QueryBuilder.tsx          # The criteria rows with AND/OR, reordering, suggestions
│   │   │   ├── QueryResultTable.tsx      # What the query matches right now, with conflicts
│   │   │   ├── ProjectOverview.tsx       # One project: query and settings in the header, members in tabs
│   │   │   ├── ProjectImages.tsx         # Images tab: image → the containers that run it
│   │   │   ├── ProjectClients.tsx        # Clients tab: host → its containers, with updates
│   │   │   ├── ProjectPullButton.tsx     # Pull & Recreate of a whole project, in every tab
│   │   │   └── ProjectPullDialog.tsx     # Asks: only what has an update, or every container (force)
│   │   ├── pullPlan.ts                   # What a project's pull sends, per mode
│   │   ├── activityFilter.ts             # Which activity events belong to a project
│   │   ├── lib/
│   │   │   └── projectMembers.ts         # Host states, container → project assignment, members, targets (pure)
│   │   └── hooks/
│   │       ├── useProjectMembers.ts      # Reads the cache and calls the three functions above
│   │       └── useProjectPull.ts         # State of the project pull dialog, and the pull itself
│   ├── activity/                         # What happened, as structured events
│   │   ├── confirmations.ts              # Delete-all text
│   │   ├── components/
│   │   │   ├── ActivityGroupSteps.tsx    # The members of one correlated group
│   │   │   └── ActivityView.tsx          # The page at /activity, and the activity of a project or container page
│   │   └── lib/
│   │       ├── activityLinks.ts          # Where the chips of an event lead
│   │       ├── collapseRepeats.ts        # Folds neighbouring rows that repeat each other
│   │       └── groupActivity.ts          # Folds the flat list into rows by correlationId
│   ├── users/                            # User management
│   │   ├── confirmations.ts              # Delete-user and last-user texts
│   │   └── components/
│   │       ├── UserOverview.tsx
│   │       ├── UserList.tsx
│   │       └── UserDialog.tsx
│   ├── settings/                         # The settings page's sections
│   │   ├── sections.ts                   # The five tabs and the keys each one saves
│   │   └── components/
│   │       ├── SettingsSections.tsx      # One component per section
│   │       └── SettingsParts.tsx         # ManualRun, reading a failure the way the app does
│   ├── tokens/                           # Registration token management
│   │   ├── confirmations.ts              # Delete-token text
│   │   └── components/
│   │       ├── TokenOverview.tsx
│   │       ├── TokenList.tsx
│   │       └── TokenModal.tsx
│   └── webhooks/                         # Webhooks: list and editor, each a page
│       ├── confirmations.ts              # Delete-webhook and discard texts
│       ├── lib/webhookForm.ts            # Draft <-> API shape, preview, placeholder list
│       └── components/
│           ├── WebhookOverview.tsx       # The page at /webhooks: loads, toggles, deletes, opens the editor
│           ├── WebhookList.tsx           # DataMultiView of the targets and their last delivery
│           └── WebhookEditor.tsx         # /webhooks/new and /webhooks/:id, with live preview and "Send Test"
├── components/
│   ├── NotFoundCard.tsx                  # A page whose subject does not exist, with the way back
│   ├── RelativeTime.tsx                  # "2 h ago" with the date in the tooltip, on the tick of useNow
│   └── entityHeader.ts                   # A detail page's header: the size of its breadcrumb title
├── hooks/
│   ├── useSearchQueryParam.ts            # Search box and active tab, held in the URL
│   ├── useNow.ts                         # One shared clock for durations that keep counting
│   ├── useSearchHotkey.ts                # "/" focuses the search of the list on screen
│   ├── useEscapeToLeave.ts               # Escape on a detail page leads back, unless a field has focus
│   ├── useBackPath.ts                    # Where closing a page leads: its parent in the route tree
│   ├── useEntityForm.ts                  # An editor's draft, its baseline and its save, checked against a schema
│   ├── useUnsavedChangesGuard.ts         # One question for every way out of a changed editor
│   ├── useDockerClientLookup.ts          # Container/image → the client it lives on
│   └── useDockerActions.ts               # Check, pull, start, stop: a refusal becomes a toast
├── lib/
│   ├── api.ts                            # The API client: every response parsed against its schema
│   ├── apiFetch.ts                       # fetch with the session attached, central 401 handling
│   ├── queryClient.ts                    # The one TanStack Query cache
│   ├── queryKeys.ts                      # Every key the cache is addressed by
│   ├── cacheUpdates.ts                   # How a message or an answer changes a cache entry (pure)
│   ├── paths.ts                          # Every path once, builders, the legacy patterns, the container group id
│   ├── storageKeys.ts                    # Every key in the browser's storage, once: dim.<area>.<what>
│   ├── backPath.ts                       # The parent of a chain of route matches (pure)
│   ├── notFound.ts                       # NotFoundError, thrown by a route whose subject is gone
│   ├── pageTitle.ts                      # The document title from the handles of the open route (pure)
│   ├── breadcrumb.ts                     # The trail to the open route, from the same handles (pure)
│   ├── entityForm.ts                     # The rules a form is checked by: field errors, sameness of drafts (pure)
│   ├── hostResults.ts                    # One action on several hosts: every refusal, by host
│   └── pendingImages.ts                  # Checks and pulls under way, from the pending mutations
├── pages/                                # Route entry points
│   ├── Login.tsx                         # Authentication page (Local & OIDC)
│   └── Settings.tsx                      # System settings page
├── queries/                              # Server data: one module per kind (TanStack Query)
│   ├── clients.ts                        # Registered clients and online/offline status
│   ├── docker.ts                         # Per-client Docker states, actions and update checks
│   ├── activity.ts                       # The activity list and the per-user seen state
│   ├── projects.ts                       # Managed projects with their members
│   ├── autoUpdate.ts                     # The configured auto-update label
│   ├── scheduler.ts                      # Status of the server's schedulers
│   └── webhooks.ts, users.ts, tokens.ts  # Their lists
├── stores/
│   └── useUIStore.ts                     # UI state (sidebar collapse, persisted) -- the only store
└── utils.ts                              # General utility functions
```

---

## 🚦 Routing & Navigation

Routing is a data router (`createBrowserRouter`, `react-router-dom` v7). `features/app/routes.tsx` describes everything inside the shell as **one tree**, and five things are read off it instead of being written down again:

- **Paths.** `lib/paths.ts` holds every pattern once (`ROUTES`) and a builder for each pattern with parameters (`paths.client(id)`). No path literal anywhere else; `generatePath` does the encoding.
- **The sidebar.** An area carries its entry in `handle.nav`. `AppLayout` marks the entry of the innermost match that has one, so an entry stays marked while any route below its area is open. On a phone the same entries are the bar at the bottom, each with its name under the icon (`bottomNavLabels`). Six names fit that width, so the entry of Images and those of the administration carry `placement: "mobile-more"` and sit in the sheet behind "More".
- **Back.** Closing a page leads to its parent in the tree (`useBackPath`, over `parentPath` in `lib/backPath.ts`). It is read from the URL alone, so a reloaded editor closes onto the same page as a clicked one. It used to be `location.state.from`, which a reload lost.
- **The document title.** `routeTitle` in `lib/pageTitle.ts` joins the handles along the open route, most specific first: `Edit · web01 · Clients · DIM`.
- **The breadcrumb.** `breadcrumb` in `lib/breadcrumb.ts` reads the same handles outermost first and gives each the address of its route: `Clients › web01 › Edit`. It names a page with `ownName` from `lib/pageTitle.ts`, so trail and title cannot disagree. Every link but the last leads somewhere; a page with nothing above it (a list, the overview) has no trail. `AppLayout` hands it to the pages through `BreadcrumbContext`, and the detail pages and every editor show it as the heading of their first card, in place of the title (`features/app/HeaderBreadcrumb.tsx`); below the `sm` breakpoint the page keeps its heading behind a `‹` that leads to the link above it (`parentCrumb`). The links are router links, so leaving a changed editor through one asks like every other way out. An instance route (`handle.onHost`) sits beside its subject's page in the tree, not below it, so its trail is told where that page is: `Containers › authelia › auth.internal`, the middle link being the container across all hosts.

| Path                | Element         | Description                                                         |
| :------------------ | :-------------- | :------------------------------------------------------------------ |
| `/login`            | `LoginRoute`    | Authentication page (Local & OIDC).                                 |
| `/`                 | `DashboardOverview` | The overview: what needs a look, across every host.             |
| `/clients`          | `ClientsRoute`  | Registered clients overview.                                        |
| `/clients/new`      | `AddClientRoute` | The `AddClientWizard`.                                             |
| `/clients/:clientId` | `ClientDetailRoute` | Detail view of a specific client (containers/images/volumes/nets). |
| `/clients/:clientId/edit` | `ClientEditRoute` | The `ClientEditor` for that client.                         |
| `/clients/:clientId/images/:imageId` | `ClientImageRoute` | One image on one client by id (untagged ones too), with its activity. |
| `/projects`         | `ManagedProjects` | Managed projects across all clients.                              |
| `/projects/new`     | `ProjectEditor` | Add a project: name and query.                                      |
| `/projects/:projectId` | `ProjectDetailRoute` | One project: its query, settings and members.               |
| `/projects/:projectId/edit` | `ProjectEditRoute` | Edit a project in the same editor.                       |
| `/containers`       | `ManagedContainers` | Aggregated containers across all clients.                       |
| `/containers/:containerId` | `ContainerDetailRoute` | One container (name + image) and its instances on every client. |
| `/containers/instances/:clientId/:containerName` | `ContainerInstanceRoute` | One instance: a container on one client, with its activity. |
| `/images`           | `ManagedImages` | Aggregated images as a Repository → Tag → Digest tree.              |
| `/images/:imageId`  | `ImageDetailRoute` | Image detail view (stats, containers using it).                  |
| `/images/instances/:clientId/:imageRef` | `ImageInstanceRoute` | One image reference on one client, with its containers and activity. |
| `/activity`         | `ActivityView`  | The activity list.                                                  |
| `/users`            | `UserOverview`  | User management.                                                    |
| `/tokens`           | `TokenOverview` | Registration token management.                                      |
| `/webhooks`         | `WebhookOverview` | The webhooks events are reported to.                              |
| `/webhooks/new`, `/webhooks/:webhookId` | `WebhookEditorRoute` | The `WebhookEditor`, adding or editing one webhook. |
| `/settings`         | `Settings`      | System settings (retention policies, image cache, etc.).            |

All routes except `/login` are children of one layout route: `ProtectedRoute`, which redirects unauthenticated users to `/login`, around `AppLayout`, which renders the `Dashboard` from `@stefgo/react-ui-components` with the page as its `Outlet`. The library's `Dashboard` renders **only the navigation**; its `pages` are built from `navEntries` (the areas of the tree), with what only the running application knows added by id -- the client count, the number of containers with an update and the dot for unseen activity. Navigation is organised into `navGroups` (`overview`, `resources`, `activity`, `admin`).

**Every area takes the plural of its list.** Nesting needs a child's path to start with its parent's, and the mix of `/clients` and `/client/:clientId` did not allow it. The **instance pages** sit below Containers and Images rather than below their client, because they are opened from those lists and theirs is the sidebar entry to mark; `App.tsx` used to force that with `matchPath`. The one page below a client is `/clients/:clientId/images/:imageId`, which only the client's image list opens.

**The previous addresses redirect.** `LEGACY_ROUTES` in `lib/paths.ts` pairs each old pattern (`/client/:clientId`, `/project/:projectId`, `/container/:containerId`, `/image/:imageId` and what lay below them) with its replacement, and `LegacyRedirect` fills the new pattern with the parameters the old one matched, query included. They are kept for one release.

**Each area has an `errorElement`** (`RouteError`). A render error replaces the page and leaves the shell standing. A subject that does not exist is the same mechanism: `ClientBoundary`, the project pages and the webhook editor throw `NotFoundError` once their list has answered, and `RouteError` shows the card with the way back. The container and image pages render their own `NotFoundCard` instead: the router keeps an error element until the next navigation, and a container leaves the fleet state for the moment a recreate takes, so those pages must be able to show their subject again.

A path nothing matches reaches the catch-all route and renders a **404 card** that names the path and leads back to the clients view.

**The pages are loaded on demand** (`React.lazy` with a `Suspense` fallback), so a chunk arrives with the route that needs it. The previous shape passed every page as an element to the Dashboard, which built the tree of all nine on every render of the shell even though one was on screen.

Each route takes what it needs from the cache itself. `ClientBoundary`, the layout route at `/clients/:clientId`, resolves the client once for the routes below it and hands it down as the outlet context (`useRouteClient`). While the client list is pending it shows a spinner -- a link to a client arrives before the list does -- and only after that is a missing client not found. `ImageDetailRoute` and `ContainerDetailRoute` pass their `:imageId` / `:containerId` parameter to the page.

---

## 🔐 Authentication

Authentication is managed by the `AuthProvider` (`src/features/auth/AuthProvider.tsx`); components read it through `useAuth` from `AuthContext.ts`.

Each context is split the same way: the context object and its hook live in a JSX-free `.ts` module, the provider component in a `.tsx` file of its own. A module that exports a component next to a hook cannot be swapped by Vite's Fast Refresh, and `react-refresh/only-export-components` reports it as an error.

- **Session**: The JWT never reaches JavaScript. The server keeps it in the httpOnly cookie `dim_session`, which the browser sends with every request and with the WebSocket handshake. The page only reads the flag cookie `dim_auth`, which carries no secret, to decide whether to render the login form.
- **Provider**: The `AuthProvider` wraps the app and provides `isAuthenticated`, `user` (`{ id, username }` from `GET /api/v1/me`, `null` until it answers), `login()` and `logout()`. `logout()` clears the flag, calls `POST /api/auth/logout` to remove the httpOnly cookie, and returns to `/login`.
- **Login Flow**:
    1. **Local**: POST to `/api/login` → the server sets the cookies → `login()`.
    2. **OIDC**: Redirect to `/api/auth/login` → provider callback with code → the backend exchanges the code, sets the cookies and redirects to `/`. Nothing is passed in the URL.
- **Stale flag**: The flag can outlive the session (a restarted server with a new `jwtSecret`, an expired token). The first request, `/api/v1/me`, then answers `401` and the API client logs out.
- **API calls**: Every request to an authenticated endpoint goes through `api` (`src/lib/api.ts`), which sends it with `apiFetch` (`src/lib/apiFetch.ts`): `credentials: "same-origin"`, so the session cookie goes along, and one reaction to `401` — it calls the `logout` the `AuthProvider` registered with `setUnauthorizedHandler` and throws `SessionExpiredError`, so the router lands on `/login`. Queries and components therefore take no token parameter. `Login.tsx` uses `publicApi` on purpose — `/api/login` and `/api/auth/config` are unauthenticated, and a wrong password must produce an error message, not a logout.
- **Expiry**: Besides the `401` handling, the `AuthProvider` logs out at the `expiresAt` that `/api/v1/me` reports, because a dashboard fed only by the WebSocket may not send a request for a long time.
- **Login UI**: The `Login.tsx` page uses the pre-built `LoginPage` component from `@stefgo/react-ui-components`, configured with app title, auth type, and handler callbacks.

---

## 🗂️ State Management

Two kinds of state, kept apart.

**What the server holds** lives in one **TanStack Query** cache (`lib/queryClient.ts`), read through the modules in `queries/`. **What only this browser knows** lives in **Zustand**: `useUIStore`, the sidebar's collapse state, saved to `localStorage` by the `persist` middleware. It is the only store. Its key, the theme's and those of every list's view settings are named in `lib/storageKeys.ts` and nowhere else, as `dim.<area>.<what>`.

### The API client (`lib/api.ts`)

Every request goes through `api.get`, `api.post`, `api.put`, `api.patch` or `api.delete`, and nothing else reads a response body.

- **Every call names the schema its answer has to match** (`shared/src/responses.ts`) and gets back what that schema parsed. An answer that does not match throws; the issues go to the console, because they name fields.
- **A refusal throws an `ApiError`** with the server's own `error` text and the HTTP status. A caller passes a `fallback` for a body that carries none.
- **`publicApi`** is the same client for `/api/login`, `/api/auth/logout` and `/api/auth/config`, where a `401` is a wrong password and not an expired session.

**An action on several hosts asks every host** (`lib/hostResults.ts`). `forEachHost` waits for all of them and throws one `HostActionError` whose message names each host that refused, with its reason. What is sent without a dialog — a check, a pull, a start, a stop — goes through `hooks/useDockerActions`, which shows that message as a toast; a remove or a prune lets it throw into its dialog, which stays open.

### Queries (`queries/`)

| Module | Holds | Kept current by |
| :-- | :-- | :-- |
| `clients.ts` | The registered clients and their status. Update and delete are optimistic and roll back when the server refuses. | `CLIENTS_UPDATE` |
| `docker.ts` | One entry per client: its `DockerState`. `useDockerStates()` gives the lists across the fleet all of them, keyed by client id. Also the Docker actions. | `DOCKER_STATE_UPDATE` |
| `projects.ts` | The managed projects with their counts. Create, update and delete read the list again before they resolve. | `PROJECTS_UPDATE` |
| `activity.ts` | The activity list as the server reads it for the session's user. Marking seen and deleting all are optimistic. | `ACTIVITY_UPDATE`, `ACTIVITY_APPENDED`, `ACTIVITY_SEEN` |
| `scheduler.ts` | The status of the schedulers the server runs. | `SCHEDULER_STATUS_UPDATE` |
| `autoUpdate.ts` | The configured auto-update label. | `AUTO_UPDATE_LABEL_UPDATE` |
| `webhooks.ts`, `users.ts`, `tokens.ts` | Their lists. Nothing broadcasts a change, so they go stale by age and are read again after a change made here. | — |

The entries a message keeps current never go stale by age (`staleTime: Infinity`). In particular a host's Docker state is requested **at most once**, for a page that is open before the socket has delivered it; a `CLIENTS_UPDATE` causes no request. The settings form is deliberately not a cache entry: a reconnect would read it again and overwrite what is typed and not yet saved.

**How an entry changes is a pure function** in `lib/cacheUpdates.ts`, tested without a socket or a component: `carryUpdateChecks` (a new state keeps the update checks the cached one knows — the same tag on the same platform, current after a pull, dropped when the digest moved elsewhere), `applyImageCheck`, `appendActivity`, `markActivitySeen` and `applySchedulerUpdate`.

**Checks and pulls under way are read off the pending mutations.** `useCheckingImages()` and `useUpdatingImages()` (`queries/docker.ts`) build the maps the Update columns animate from, so a key cannot be left behind by a path that forgot to clear it.

The cache is cleared on logout: what it holds was read for the user who is leaving.

### Real-time Updates (WebSocket)

The `WebSocketProvider` (`src/features/app/context/WebSocketProvider.tsx`) maintains a persistent WebSocket connection to the backend (`ws://.../ws/dashboard`), authenticated by the session cookie the browser sends with the handshake.

**The messages are a contract in `@dim/shared`.** `DashboardMessageSchema` (`shared/src/dashboardMessages.ts`) lists every message the server sends a dashboard as one discriminated union; the backend's senders take that type, and the provider parses each message against the schema (`features/app/lib/dashboardMessages.ts`). What does not match is dropped and reported once per type. The dispatch is a `switch` that ends in `assertNever`, so a message type without a case fails `typecheck`.

| Message | Written to |
| :--------------------- | :----------------------------------------------- |
| `CLIENTS_UPDATE`       | The client list, replaced |
| `DOCKER_STATE_UPDATE`  | That client's Docker state, through `carryUpdateChecks` |
| `DOCKER_ACTION_RESULT` | Nothing: the request that asked for the action gets the same result as its own answer |
| `SCHEDULER_STATUS_UPDATE` | The scheduler status, one scheduler at a time |
| `AUTO_UPDATE_LABEL_UPDATE` | The auto-update label |
| `PROJECTS_UPDATE`      | The project list, replaced |
| `ACTIVITY_UPDATE`      | The activity list, replaced |
| `ACTIVITY_APPENDED`    | The activity list — new events merged by id, newest first |
| `ACTIVITY_SEEN`        | The activity list — the ids marked seen, also from another tab |

On connect the server sends `CLIENTS_UPDATE`, every stored Docker state and the activity list by itself, so the first screen fills without waiting for a REST call.

**A lost connection is said.** The dashboard does not poll, so without the socket the page shows a snapshot. Five seconds after the socket is gone (`isLost` in `WebSocketContext`) the shell shows the library's `ConnectionBanner` and wraps the page in `StatusDotProvider live={false}`, which stops every status dot from pulsing. The delay keeps a server restart from flashing the banner. After a reconnect, everything the server does not send again by itself (`isPushedOnConnect` in `lib/queryKeys.ts`) is invalidated: what is on screen is read again, the rest when it is next shown.

---

## 🧩 Feature Details

### Overview (`features/dashboard`)

The page at `/`: five `StatCard`s, each a count and the way to the list behind it — clients online, containers with an update available, containers not running, unseen errors and warnings, and the next run of the server's schedulers. The last one shows a date where the others show a count, so its value is set a size smaller and kept on one line.

**A card does not show a number it cannot stand behind.** With no client connected, "Containers not running" shows `–` and "No client is online" instead of a zero that would say everything runs (`notRunningReading`). "Updates available" still counts the last known state of offline hosts, and says below its number how many of the updates sit there (`updatesReading`, `updatesOnOfflineHosts`).

**Below the cards, "Needs attention" names what three of them count**: the offline clients with when they were last seen, the containers with an update (those on connected hosts first), and the unseen errors. `needsAttention` builds the groups with the predicates the cards count with; each shows at most five rows (`ATTENTION_LIMIT`), each row is a link to its page, and "n more" leads to the list with the rest — the container list opens with its update filter set. A group with nothing in it is left out, and with no group the section is not there. Warnings are counted on the card but not listed.

**Cards and badges count with the same functions.** `lib/dashboard.ts` holds `clientCount`, `updatesAvailable`, `notRunning` and `nextSchedulerRun`; `unseenProblems` sits in `features/activity/lib/unseenTone.ts`, and the tone of the sidebar's dot is derived from its counts. `AppLayout` calls the same functions for the badges on Clients, Containers and Activity, so a card and its badge cannot disagree. The container counts run on the groups of `buildContainerGroups`, which is what the container list shows — a stopped container on an offline host is not counted, as its group reads `unknown` there. Everything is read from the cache the socket writes, so a card changes when a host does.

### The fleet views are pure functions

What is shown across hosts is computed outside React: `buildContainerGroups` (`features/containers/lib`), `buildImageTree` (`features/images/lib`) and `hostStates` / `projectAssignment` / `buildProjectMembers` (`features/projects/lib`), each with a test next to it. The hooks of the same name (`useContainersData`, `useImagesData`, `useProjectMembers`) read the cache and call them in `useMemo`. Three rules live in one place each: `checkStatus` reads a registry check, `normalizeImageRef` adds `:latest` to a reference without a tag (a container's `configImage` is compared with a host's `repoTags` through it), and `isCheckableRef` says whether there is a tag to ask a registry about.

Measured on a synthetic fleet, each of them takes under 4 ms for 50 hosts with 40 containers each, and at most 15 ms for 200 hosts with 60 — which is why the aggregation stays in the browser and has no endpoint of its own.

### ManagedClients (`features/clients`)

The container component for the client management view. Coordinates between the client list, the editor and the add-client wizard.

- **Functionality**:
    - Displays the list of registered clients (`ClientList`). The table and the list view show the same columns but the ID: status, version, capabilities and the last auto-update, so "which agent is behind" is answered without switching the view. "Status" sorts by when a host was last heard from (`clientStatusOrder` in `features/clients/lib/clientStatus.ts`): ascending, a host that never connected comes first, then the ones gone longest, the connected ones last.
    - Opens the client editor (`ClientEditor`) for renaming a client, for inbound clients editing or switching off the address its connections must come from, and for outbound clients the address the server dials. `Escape` leaves the editor and discards, as the Cancel button beside it does; while anything has been changed the footer says so, which is the safety net for both. The field is validated with `Ipv4OrCidrSchema` from `@dim/shared`, the same rule the server applies; server errors are shown in the form. An allowed address that would not let `inboundLastIp` — the address of the agent's last successful connect — back in is called out beneath the field, using the same `isIpAllowed` the server decides with. It does not block saving: the value is well-formed and the agent may have moved on purpose, so this is a consequence worth seeing, not a reason to refuse. The editor also carries this host's auto-update schedule: a box for "give this host its own", and the expression under it. The box off means the default from the settings applies; on with an empty expression means the host auto-updates only what belongs to a project. Saving reaches the agent at once — it runs that schedule itself, from the policy the server sends it.
    - Opens the `AddClientWizard` — one flow for both connection modes, replacing the former "Add Outbound Client" dialog and "Generate New Token" button.
    - Deletes clients after a confirmation that says what goes (the server-side record and cached Docker state) and what stays (everything on the host; the agent keeps running but is refused).

### LoadingIndicator and StatusDot (`@stefgo/react-ui-components`)

Both come from the UI library; the local copies that preceded them are gone.

`LoadingIndicator` is "something is on its way", for a view with nothing to show yet. `role="status"` announces the label when it appears; the spinner is decorative.

`StatusDot` takes a `tone`, the role of a state, never the state itself — so each caller maps its own words onto one:

- **A client** is live or not. `onlineTone(online)` in `features/clients` gives `success` or `neutral`; it takes a boolean rather than a client's status field, because two of the call sites have only the boolean.
- **A container** has more states. `stateDot(state)` in `features/containers/containerState.ts` gives the props of the dot: `running` is the same glowing dot a connected client gets, `restarting` pulses, and `unknown` — the container of an offline host — is a hollow ring, which is not "stopped". Every list that draws a container reads it from there.

The dot is used without a `label`, so it is decorative: every place that shows it also names the state in text beside it.

### Columns of a list

A `DataMultiView` with a table and a list view describes its columns once, as `columns` (`DataColumnDef`), instead of as `tableDef` and `listColumns`: the heading is also the list label, and one `render(item, view)` serves both views. Where the two views differ — the list leads with a bolder name, the table has a column the list folds into another — the cell reads `view`, or the column is switched off for one view with `table: false` or `list: false`.

`listGroups()`, `actionsColumn()` and their tree variants come from `@stefgo/react-ui-components`, as do `PAGE_SIZE` and `listPagination()`: the layout every list shares lives in the library, where the sibling apps read it too. `listGroups()` gives the two blocks every list row has, the content and the actions at the right edge, and `actionsColumn(render)` the actions as the last column of the table and the second block of the list. A list whose actions differ between the views (`ManagedProjects`) or are missing for some rows (`ClientNetworkList`) builds that column itself and names the block with `ACTIONS_GROUP`.

**A view with a table only keeps `tableDef`.** `columns` always produces a list view as well; on a view that has none, that would add a view switch and force the empty list on a narrow screen. `sort.colIndex` counts the table's columns, so a column with `table: false` has no index.

**A tree is described by `columns` too, because a phone cannot show its table.** Below 768 px `DataMultiView` shows the list view, and for a tree that list keeps the children under their row, indented, behind the same expand button. `treeListGroups()` and `TREE_LIST` lay such a row out on one line: what it says on the left, cut off rather than wrapped, and its actions on the right, so every action of a row is reachable without scrolling sideways. The list keeps what a row is acted on by — in the container tree the state, the name, the update status after it and the image below — and leaves the counting columns to the table (`list: false`). `treeActionsColumn(render)` is the actions column for it. The container and the image tree offer the list as a second view on a wide screen as well; the two trees of a project's tabs spread `TREE_ONLY`, which hides the switch — there the hierarchy is the point. The list view does not sort, so `ManagedContainers` hands its groups over by name.

**`/` puts the cursor into the search of the list on screen** (`hooks/useSearchHotkey`, mounted once in `AppLayout`). The search field of every `DataMultiView` is a `searchbox`, and the hook focuses the first visible one — no ref through each list. `isSearchHotkey` (`lib/searchHotkey.ts`) is the rule: a bare slash, not one typed into a field and not one with a modifier. While a dialog is open the key is left to it.

### Forms (`hooks/useEntityForm`, `hooks/useUnsavedChangesGuard`)

Every editor keeps the same three things: a draft, what it was when it was opened or last saved, and how the save went. `useEntityForm` holds them, and each editor used to build them by hand, with `JSON.stringify` for "has it changed".

- **Checked before it is sent.** The draft is turned into the request (`toInput`) and parsed with **the schema the backend parses that request with** -- `WebhookInputSchema`, `UpdateClientSchema`, `CreateUserSchema`, `CreateProjectSchema`. An issue is shown at its field (`fieldOf` maps a request key to a draft field); what belongs to no field is `formError`. `rules` adds what only the form knows, such as "a ticked restriction needs an address".
- **Errors appear with the first change.** A form that was just opened has a disabled Save because there is nothing to save, not because a field is wrong.
- **The rules are pure.** `lib/entityForm.ts` and the `lib/*Form.ts` module of a feature (`clientForm`, `userForm`, `webhookForm`) hold them apart from React, where the tests reach them.

`useUnsavedChangesGuard(isDirty, editor)` is the one place unsaved work is asked about. Every way out of a page goes through the router's blocker -- the close button, Cancel, Escape, an entry in the sidebar, the browser's back button -- so they all ask the same question (`describeDiscardChanges` in `components/confirmations.ts`). The editors used to ask only for their own close button and Escape; a click in the sidebar dropped the edits without a word. A reload or a closed tab is not a navigation the router sees, and gets the browser's own prompt (`beforeunload`).

It returns `close` (leave for the parent in the route tree, asked about while dirty) and `leave` (the same without the question, for the navigation that follows a save; it takes another target when the save leads elsewhere, as a new project leads to its page).

| Surface | Form | Guard |
| :-- | :-- | :-- |
| `WebhookEditor` | `useEntityForm`, `webhookForm.ts` | yes |
| `ProjectEditor` | `useEntityForm`; name clash and query conflicts are added to its verdict | yes |
| `ClientEditor` + `ClientIdentityCard` | `useEntityForm` held by the editor, `clientForm.ts` | yes |
| `UserDialog` | `useEntityForm`, `userForm.ts` | no: a modal, not a route |
| `Settings` | its own draft per section, checked by `sectionError` | yes, while any section is unsaved |

### Dialogs

`Modal` from `@stefgo/react-ui-components` is what a dialog is built from. The three hand-built overlays that preceded it (`fixed inset-0 bg-black/80 …`) had no focus trap, no Escape, no scroll lock and no focus return.

- `UserDialog` turns `closeOnOverlayClick` off: it holds unsaved input, and a stray click beside it should not discard the work.
- `TokenModal` turns `closeOnEscape` off as well and hides the close button. The token is in the clear exactly once, so dismissing the dialog is not a way out but the loss of what the flow was for; the button below it is the only way on.

Editors that live in the workspace rather than in a dialog bring their own `Escape` on a `window` listener — see `AddClientWizard` and `ClientEditor`.

### Confirmations

Every question before an action, and every notice after a failed one, goes through `useConfirm()` from the library. `ConfirmProvider` sits next to `ToastProvider` in `App.tsx` and renders the one dialog that answers; no component keeps a pending request, a busy flag or a `ConfirmDialog` of its own, and no component calls `window.alert` or `window.confirm`.

- `confirm(options)` resolves `true` or `false`. An action that is quick to hand off — a pull, a discard — runs after the `await`.
- An action whose outcome is worth waiting for — a delete, a remove, a prune — goes in `onConfirm`. The dialog stays open and busy until it settles; a rejection keeps it open with the error inside it, next to the button that retries. That is why `ClientOverview.sendAction` throws rather than reporting the failure itself.
- `alert(describeFailure(title, error))` from `utils.ts` reports a failure of an action that was not asked about first, such as the cleanups in Settings.

**The texts live in a `confirmations.ts` per feature** (`activity`, `clients`, `containers`, `images`, `projects`, `tokens`, `users`, `webhooks`), one `describeX(...)` per action, returning the complete options including `variant`. A component decides *that* it asks, never *what* the question says or whether it is `danger`. The reasoning behind a wording — what the agent really does, what stays on the host — is kept as a comment on its function.

### AddClientWizard (`features/clients/components/add-client`)

One flow for both connection modes, built on `Wizard` from `@stefgo/react-ui-components`. Step 1 is the decision about which side opens the connection; step 2 is the branch that follows from it. As two separate entry points this was a decision the operator had to have made before reaching a form.

It lives in the workspace rather than in a modal, because the two branches end in different things: a token to carry to another machine, or a connection attempt that may fail with a reason worth reading.

- **Inbound branch**: display name and allowed address for the client the token will create. Both optional — without them the agent's hostname names the client and the address it registers from becomes its allowed address. Ends in a `TokenModal`, which shows the token once.
- **Outbound branch**: hostname, target address and the agent's setup PIN (or its `DIM_REGISTRATION_SECRET`); finishing dials the agent straight away, and a refusal is shown on the step with the agent's own reason.
- The wizard renders only the current step, so the form state lives above it in `useAddClientForm` — a step holding its inputs in its own `useState` would lose them on Back.
- Both fields that the server validates are checked in the form with the same functions the endpoints use (`Ipv4OrCidrSchema`, `normaliseTargetAddress` from `@dim/shared`).
- `Escape` leaves the wizard. The listener sits on `window`, one level further out than menus and dialogs that listen on `document` and stop the event there, so an open select closes itself without taking the wizard with it. It is off while the token is on screen: that dialog is acknowledged by button, because the token is shown exactly once.

### ClientOverview (`features/clients`)

The detail view for a single client, shown when navigating to `/clients/:clientId`. Uses `Card` and `ActionMenu` from `@stefgo/react-ui-components` and renders four tabs backed by the client's Docker state (`useDockerState` in `queries/docker.ts`):

- `ClientContainerList` — containers, with an **Up-to-date** column, a **Check** button in the header that checks every container of the host, **Check for Update** and **Pull & Recreate** as buttons in the row and start/stop/restart/remove in its menu. The update status and both update actions come from the container's instance row (`useContainersData`, `useContainerActions`), so they behave exactly as on the container instance page.
- `ClientImageList` — images, with an **Up-to-date** column, a **Check for updates** button in the header that checks every image a container of the host runs, **Check for updates** and **Pull & Recreate** as buttons in the row and pull/remove in its menu. Status and actions read the image as the page a row opens does (`updateStatusOf` in `features/images/lib/updateStatus.ts`). A row opens `/clients/:clientId/images/:imageId`. **Prune** in the header sends one `image:prune`, which removes every image no container on this host uses, tagged or not (`docker image prune -a`); it asks first and names how many images go.
- `ClientVolumeList` — volumes, with remove.
- `ClientNetworkList` — networks, with remove.

Below the containers and the images tab, the host's **activity** narrowed to that tab: `clientContainersActivityFilter` takes this host's events about a container, `clientImagesActivityFilter` its events about an image alone — a pull, a check, a removal. Volumes and networks have no activity of their own.

An offline client shows no cards and no tabs: its last Docker state would read as current, and its actions would go to a host that cannot answer. A notice below the header says so instead of leaving the page empty — since when the client is gone, how old the state it left behind is, and that actions are possible again once it is connected. The text is `offlineNotice` (`features/clients/lib/offlineNotice.ts`); a client that never connected or never reported a state gets a sentence of its own rather than a date. The header's details still name both times.

Every tab hands its actions to `ClientOverview.handleAction`. Remove actions (container, image, volume, network) stop there and ask through `useConfirm()` with `describeRemove`, naming the entry and the consequence: a container is removed with force, even while running; image, volume and network are removed without force, so Docker refuses them while in use. All other actions are sent at once.

### ManagedContainers (`features/containers`)

Aggregates containers from every connected client into a tree (client → containers). Supports search, pagination, a state-based status dot, per-row container actions, and a **Check for updates** action that runs image update checks for every distinct image in view.

Two filters sit next to the search: **state** (running, not running, host offline) and **update** (has update, up to date, not checked). Both live in the URL (`?state=not-running&update=update`; `state.containers` / `update.containers` in a project's tab, after its `search.containers`), named once in `lib/paths.ts` (`CONTAINER_FILTER_PARAMS`, `containersFiltered`). `filterContainers` (`features/containers/lib/filterContainers.ts`) applies them together with the search, which reads a container's name and image and the names of its hosts.

**The filters work on host rows, not on groups.** A group keeps the hosts that match and goes when none does; its own row still shows the state and status of the whole group. That is what makes the overview's cards exact: "Updates available" and "Containers not running" count with `matchesUpdate` and `matchesState`, the predicates of the filter, and open the list with that filter set — the number on the card is the number of host rows below. While a filter or a search is set the groups are open. A stopped container of an offline host is *host offline*, not *not running*, as on the card. The **Up-to-date** column sorts by how much attention a status asks for. Remove asks first; on a container row it removes every instance of that name, and the dialog says on how many clients.

**Several rows can be acted on at once.** Every row carries a checkbox, and the line above the rows offers Check, Pull & Recreate, Start and Stop for what is picked. "Select all" picks what the filters and the search leave, on every page — so with the update filter set, every hit is updated with two clicks. The rules are `features/containers/lib/selection.ts`: the selection is kept as host rows, a group is ticked exactly when every host row shown under it is (`shownSelection`, `changeSelection`), and a row the list no longer shows leaves the selection. `planSelection` turns it into what each action sends — one check per image reference, one pull per reference limited to the picked containers on connected hosts that are behind, and start and stop by the rule of a single row — and each button shows how many containers it reaches and is off at none. The pull asks once for all of them through `describePull`; Stop asks too, since several at once are a larger outage than one (`describeStopSelection`). A pull, a start and a stop end the selection, a check leaves it.

A click on a container row opens `/containers/:containerId`; a client row opens the page of that instance, `/containers/instances/:clientId/:containerName`. The id is the group key of `buildContainerGroups` (`name||configImage`), built and taken apart by `containerGroupId` / `parseContainerGroupId` in `lib/paths.ts` and nowhere else. The actions of a row live in `useContainerActions`, which the list and the page share, so both ask the same questions.

### ContainerOverview (`features/containers`)

The detail view for one container across the fleet. An `EntityHeader` names it, shows its aggregate state and update status as badges, and keeps the configured image, the running count, the auto-update reading and the last registry check behind its details toggle; its menu starts, stops or removes every instance at once. **Last Checked** and **Check Result** are what the update badge cannot say: the badge reads an error as "unchecked" and falls silent, so the two rows carry the newest timestamp of the hosts' answers and, where one failed, the registry's reason (`Registry rate limit reached (429)`), with a count where only some hosts failed. `summarizeChecks` (`features/images/lib/checkSummary.ts`) works these out; `ImageOverview` shows the same two rows from the same function. Below it a table lists the instances, one per client, with their state, image, auto-update reading and per-instance actions. **Check** and **Pull & Recreate** sit in the table's header and act on every instance; the buttons of a row act on that instance alone.

**A pull recreates the row's containers and no others.** `useContainerActions.pullAndRecreate` sends `containerIds` per host with `image:update`; without them the agent recreates every container on the image, so an instance row used to take along the other containers of the same image on its host. The container list's rows share the hook and are limited the same way.

Below the table the container's **activity** on every host: `ActivityView` with the filter from `features/containers/activityFilter.ts`, its own search parameter (`search.activity`), opening on the unseen entries like the activity page. An event belongs to the page when its `subject.containerName` is the container's name -- the id changes with every recreate -- or, without a name, its `containerId` is one of the current instances. An event about the image alone, such as a pull, is not listed.

**An offline host's containers are not read as current.** The server keeps the last snapshot a host reported, and a host that went away -- or an agent that stopped its own container -- leaves that snapshot saying `running`. So an instance on a disconnected client shows a hollow dot and "Unknown (client offline)", the group's state is read from the instances on connected hosts only (`unknown` when there are none), and every action skips the offline instances: start, stop, remove and pull are disabled where nothing is left to reach. The container list follows the same reading.

**A container's uptime keeps counting.** Docker's status text ("Up 4 hours") would be frozen when the agent took its state, and the agent sends a new state only when something happens on the host, so the agent does not send it at all. Every list shows `ContainerStatus` (`features/containers/components`), which derives the text from `state`, `health`, `startedAt`, `finishedAt` and `exitCode` by the rules of `docker ps` (`containerStatus` in `containerState.ts`, `humanDuration` in `utils.ts`) and re-renders on the tick of `hooks/useNow` -- one interval of 30 s for the whole page. Where the timestamps are missing, from an older agent or a stored state, the text goes without its duration ("Up", "Exited (0)"). A search over the status matches the text as shown.

**When something happened is written as the distance from now.** The activity list's time column and "last seen" in the client list and on a client's header show `RelativeTime` (`components/RelativeTime.tsx`): "just now", "5 min ago", "2 h ago", "3 d ago", with the date itself in the tooltip and in the element's `dateTime`. The text is `formatRelative` in `utils.ts`; past thirty days, and for a date that lies ahead, it writes the date instead. It moves on the same tick as the uptime. A sentence that states a date -- the offline notice, the details of a header, the repeats of an activity row -- keeps the date.

**A row's menu offers Start, Stop, Restart and Remove**, built by `containerMenuEntries` for the list across all hosts and for both menus of the container page. Which instances an entry reaches is `startTargets`, `stopTargets` and `restartTargets` in `containerState.ts`: only connected hosts, and only a running container restarts. An entry is enabled exactly when its list is not empty, and the request goes to that list.

`Escape`, like a removed container, leads back to `/containers`, the page's parent in the route tree -- also when the page was opened from a project's tab. An id that matches no container says so on the page instead of redirecting. A click on an instance row opens that instance's page.

### ContainerInstanceOverview (`features/containers`)

One container on one client, at `/containers/instances/:clientId/:containerName`. The instance is addressed by its name, which is unique per host, not by the Docker id, so the URL survives a recreate. The route sits below the containers in the tree, so the **Containers** entry of the navigation stays active whichever list opened it. Its `EntityHeader` shows the instance's state and update badges in the row; **Start**, **Stop**, **Check**, **Pull & Recreate** and the menu (remove) act on this instance alone. Start and stop sit in the header rather than behind a menu, so each asks for confirmation first (`describeStartContainer` / `describeStopContainer` in `confirmations.ts`); the container lists keep them in their menus without a dialog. Its details are three `detailGroups` from `instanceDetails.tsx` in one card, since all three describe this one instance, and one **Show more** opens the rest of each: **Client** -- the client (linked), its hostname and its address (the last IP of an inbound agent, the target address of an outbound one); **Container** -- the status as `docker ps` writes it, the container id, the current image, and on request the auto-update reading, creation date and ports; **Image** -- the image the container runs: the one behind its `imageId`, not the one its tag points to now, so a pull without a recreate shows as **Superseded by a newer pull**. It carries the configured image (linked to the image page), image id, platform, size, creation date, tags, digests, the OCI labels the image sets itself (title, version, revision, build, source), the host's last registry check and, with an update pending, what the registry says about the new image (`remoteImageDetails` in `features/images/lib`, shared with `ImageOverview`; both read the labels through `ociLabelDetails`). The source is always the last row and spans every column; a source the two share is named once. Below that the instance's **activity**: `containerInstanceActivityFilter` reads events the same way as the container page -- by name, falling back to the current id -- and takes only those whose `clientId` is the instance's host. Back leads to the container's page across all hosts.

### ManagedProjects & ProjectOverview (`features/projects`)

A project is a group of containers across the whole fleet, defined by a query over clients,
containers and images (see [Projects](api.md#-projects) in the API reference). A container belongs to one project at most.

- **`ManagedProjects`**: every project with its auto-update setting, its schedule, how many
  containers it currently has, and an **Up-to-date** column drawing the same icon the image lists
  use, from the worst status among the images the project runs. The row acts on it as well:
  Check asks the registry about every image of the project, Pull & Recreate opens the
  project pull dialog (see below); the header's Check does the same
  across every project, asking once per reference rather than once per project. Edit and
  Delete sit in the row menu; the delete dialog says that only the DIM entry goes and no
  container is touched. There is no Clients column — the project page answers that.
- **`ProjectEditor`**: one page for `/projects/new` and `/projects/:projectId/edit`, laid out
  like the add-client flow (`Escape` leaves, back goes to the parent in the route tree). Name, query,
  auto-update and schedule, and below them the **result table**, recomputed on every keystroke
  from the Docker states in the cache: every matching container with its client, image, the numbers of the criteria that match it, and the project it already
  belongs to, if any. Saving is blocked while there are such conflicts, while a criterion has
  no value and while the name is taken; the server checks the same again.
- **`QueryBuilder`**: one row per criterion that reads as a sentence — AND/OR toggle, category,
  attribute, operator ("is", "is not", "matches pattern", "does not match"), value with
  suggestions from the fleet. Typing `*` or `?` switches to pattern matching. Rows can be moved,
  duplicated and removed; each row shows how many containers it matches on its own, and the
  query is repeated as the expression it is evaluated as, top to bottom, bracketed where
  AND and OR mix.
- **Conflicts**: a container that matches several projects is listed in each of them. The
  Auto-Update column marks it with an error icon and links to every project involved
  ("Conflict", or "Label" where its label carries it to the host schedule); a grouped row
  that reads "Mixed" carries the icon when any instance is in conflict. The project list shows
  the number of such containers next to the name, and the project page explains it in its
  header, where it stays visible while the details are closed.
- **`ProjectOverview`**: an `EntityHeader` with the query in its readable form always in view
  and the two settings in its collapsible details, the members below in three tabs. "Use the default schedule" writes `null`, which means
  *inherit* — auto-update is switched off through its own control, never through an empty
  schedule.
    - **Containers** is the fleet-wide `ManagedContainers` list narrowed to this project, so a
      row means the same thing and offers the same actions as in the sidebar view.
    - **`ProjectImages`** groups the same members by the image they were built from: image →
      the containers that run it, with the update status and Check / Pull & Recreate per row.
    - **`ProjectClients`** groups them by the host they run on: host → its containers, with
      the host's online dot, and the same update column and actions — a check from a host row
      covers every distinct reference its containers were configured with.
    - Below the tabs, in all three, the project's **activity**: `ActivityView` with the
      filter from `activityFilter.ts`, its own search parameter (`search.activity`),
      opening on the unseen entries like the activity page. An event belongs to the project when its
      `subject.projectIds` (entered by the server when it stored the event), the
      `subject.projectId` of an auto-update run or the `data.projectIds` of a conflict name
      it. Events stored before the server entered `projectIds` fall back to the current
      membership: same host, and one of the project's containers or an image one of them runs.
- **Project pull** (`ProjectPullButton`, `ProjectPullDialog`, `useProjectPull`, `pullPlan`):
  the list's row action and a button next to Check in each of the three tabs open the same
  dialog. It offers two options, each with the number of containers it recreates: **only
  with an update** pulls a reference on the hosts whose own copy a check found behind;
  **all containers (force)** pulls every tagged reference on every host and sends
  `params.force`, so the agent recreates containers already on the new image as well. Both
  pass the project's container ids, so other containers on the same image are left alone.
  The button is enabled while any container of the project has a reference with a tag.
- **`useProjectMembers`**: `useHostStates`, `useProjectAssignment` (container → project, via
  `resolveAssignment` from `@dim/shared`, the function the server and the agents use too) and
  `useAllProjectMembers`, each a call of the function of the same name in `lib/projectMembers.ts`. Everything is derived from the Docker states the cache already
  holds, so a container that starts or stops matching moves without anything being fetched.
  `ProjectMembers.targets` carries one entry per image reference — the digests a check is
  keyed by, the hosts a pull has to reach, and how far behind it is; `imageCount` and the
  project's update status are derived from it, and it is what the list's row actions act on.

### ManagedImages & ImageOverview (`features/images`)

`ManagedImages` renders a three-level tree: Repository → Tag → Digest, with per-node actions (Check Update, Pull & Recreate, Remove, Prune). Update status animations are driven by `useCheckingImages()` and `useUpdatingImages()` (`queries/docker.ts`), scoped per digest. Filtering via the search bar traverses the full tree so matches deep in a tag/digest still surface. Both prune actions (per row and the toolbar button) ask first and name how many images go.

`ImageOverview` is the dedicated detail page (`/images/:imageId`) with `StatCard`s and two `DataMultiView` tables: one for the image's tags/digests — each row with **Pull & Recreate** for its host, enabled while an update is available — and one for the containers that use them. Its Prune button asks first as well.

The page is built like the client and container pages. Its header carries the details (repository, tag, digest, hosts, size, last check — and, for an image with an update, what the registry's OCI labels say about the new image: title, version, revision, build date and source, each only where the image sets it; the source last and across every column) and an action menu with **Check for Update** and **Pull** (or **Pull & Recreate**). Prune stays with the list below: it acts on the images listed there. Check and pull come from `useImageNodeActions`, which the image list's row actions use too, so a row and its page cannot disagree about what is possible. The open tab is kept in the URL. `Escape` leads back to the image list, the page's parent in the route tree.

A row of the image list opens `ImageInstanceOverview` at `/images/instances/:clientId/:imageRef`: one image reference (`repository:tag`, URL-encoded) on one client. It is addressed by reference, not by image id, so a pull that moves the tag to a newer image keeps the page on it; `ImageOverview` tells the list which of an image's tags the row stands for (the page's tag, or on a repository page the first tag in that repository). Like the container instance page, it sits below its list in the route tree, which keeps the **Images** entry of the navigation active. Its `EntityHeader` carries the update badge, **Unused** where no container was created from the reference, **Check for Update** and **Pull** (or **Pull & Recreate**) for this host alone -- no remove -- and three `detailGroups`: **Client** and the image details from `instanceDetails.tsx` (`clientGroup`, `imageDetails`), plus **New Image** with an update pending. Below it the containers created from the reference or running its current image, each opening its instance page, and the **activity**: `imageInstanceActivityFilter` takes the events of this host about the reference (compared with `imageRefKey`, `latest` filled in) and about those containers, by name and, without one, by id. Back leads to the reference's page across all hosts.

`Escape` on a detail page — client, container, image, project — is handled by `hooks/useEscapeToLeave`. It does nothing while the focus is in a field, so Escape in a list's search box clears nothing and leaves nothing.

### ActivityView (`features/activity`)

**On a phone the message is the row.** Below 640 px it wraps instead of being cut off, the time column is hidden and the time stands under the message and its chips, and the cells give up their gutters, so nothing of a row lies outside the screen.

The page at `/activity`, and the activity list of a project or container page. With a `filter` it shows
only the groups with an accepted event, takes its start level from those alone and offers no
"Delete all", which would delete more than the list shows. Its entries are structured events: a `kind`, a `level`, what the
event is about and the facts of that kind.

**The text is written in one place.** `activityText.ts` in `@dim/shared` is the one place a
wording exists — the webhooks send the same sentence as `{{event.message}}`: an agent
reports `container.died` with an exit code and nothing else, and the sentence is composed
from that. So an agent of an older version stays useful without knowing how today's
dashboard phrases things, a wording can be changed without asking a fleet of hosts to
update, and the level filter works on `level` rather than on a search through prose. A
kind this build does not know still gets a row — the fallback prints the kind itself, because
dropping the line would hide an observation nobody can make again.

**Rows are groups.** `groupActivity.ts` folds the flat list by `correlationId`: the
summarising event (`autoupdate.run`, `action.requested`) is the head, the rest are its
expandable steps (`ActivityGroupSteps`, with an `N steps` badge). The head carries the most
severe level in the group, so a run whose last step failed does not read as an untroubled
one. Grouping is a lookup, not a guess — whoever caused the group put its id on every member
— so nothing depends on arrival order and an event delayed by an offline stretch still lands
in its group hours later. A group with no head yet (an action still running) is stood in for
by its earliest member, so no event can go missing. An `action.unconfirmed` (the server's
"result pending") is dropped from its group once the agent's `action.completed` or
`action.failed` has arrived (`supersededIds`); it no longer counts towards the group's level or
the badge, and seeing the group sees it too.

**One kind of row is a guess: a lifecycle burst.** A container recreated on its host with
`docker compose up` reports five events (`stopped`, `died`, `removed`, `created`, `started`)
that carry no `correlationId`, because the agent only watched. `groupActivity` folds the
uncorrelated lifecycle events of one container name on one host into one row while each lies
within ten seconds of the next (`LIFECYCLE_WINDOW_MS`), and `lifecycleTitle` names it:
*recreated*, *restarted*, *created and started*, *removed*. By name and not by id, since a
recreate changes the id. Such a row lists every event as a step, shows no kind chip, carries
the most severe level of its steps, and is marked seen as a whole. A correlated event is never
taken into a burst, and `container.health` is not a lifecycle event.

**Repeats are one row.** `collapseRepeats` (`lib/collapseRepeats.ts`) folds neighbouring rows
that say the same about the same thing — same sentence, kind, level, host and subject, and
the same seen state — into the newest of them, with a `4×` badge; expanded, the row lists
when the others happened. It runs after the filters and the search, so what they hide no
longer stands between two repeats, and never across a row that says something else. A
correlated group with steps is never folded: it is told apart by what it did. "Mark as seen"
on the row covers every repeat (`rowEvents`).

**The level filter is a minimum**, and its entries say so (`≥ warning`). It sits at the right end of the search bar (`searchActions`)
and opens on what needs a look: `error` while an error is unseen, else `warning` while a
warning is, else `info` — the same rule as the sidebar badge. The start is fixed once the list
is known, so marking rows seen does not move the filter. `trace` events — agents connecting
and disconnecting — are hidden until `trace` is chosen.

**A second filter hides what has been seen.** Next to the level filter, `Show: all` / `Show: unseen`
switches between the whole list and the rows with something unseen in them; under `unseen` a
row leaves the list once it is marked seen. It starts at `unseen`, on the activity page and
on a project or container page alike.

**"Mark as seen" follows the filter.** It marks the unseen events of every row the level
filter and the search leave, across all pages, and nothing the reader has not been shown.

**Entries are not deleted one by one.** A row can be marked seen; the history goes as a whole
("Delete all") or through retention. The sidebar badge does not
count them either. An event that names a host but carries no `clientName` (recorded before
the server stored it) gets the name from the client list by `clientId`.

**The chips below a row are links.** `activityLinks` (`lib/activityLinks.ts`) gives each its
target: the host's page, the container and the image on that host, the project. A host that
has been deleted since leaves its chips as text, and so does a project where the event is
about several. The kind has no page and is always text.

Everything else is found through the search box, as on the other lists (`useSearchQueryParam`,
so the query survives a reload). It matches the sentence a row shows, its detail line, the
`kind`, and the host, container, image and project the event is about. A group matches when
any of its events does, so a step is found under the operation it belongs to. The sidebar
badge counts single unseen events, not groups.

### UserOverview (`features/users`)

Manages user accounts. Supports creating, editing, and deleting users via a `UserDialog` form. Deleting asks first; the dialog states that a session the account already holds stays valid until it expires, because the API checks only the JWT. For the last remaining user a second dialog explains why it cannot be deleted instead of sending the request. `UserList` is a `DataMultiView` like every other list: search by username, a list view for narrow screens, pagination.

### TokenOverview (`features/tokens`)

Lists registration tokens via `TokenList` — a `DataMultiView` with search over token hash, display name and address — and deletes them after asking. Tokens are **issued in the `AddClientWizard`**, not here: that is where the two defaults a token carries — display name and allowed address — are entered, and a second entry point would only produce tokens without them. The list shows a token by the first 12 characters of its SHA-256 hash (the full hash in the tooltip), since the server keeps nothing else; the token itself is shown once, in the wizard's `TokenModal`. It shows both defaults per token, or "From the agent" for a token that carries neither.

### WebhookOverview & WebhookEditor (`features/webhooks`)

Its own entry in the sidebar, in the Administration group above Settings. `WebhookList` is a
`DataMultiView` like every other list — search over name and URL, table and list view — and
shows per webhook its target, its filters, a switch to turn it on and off, and how the last
delivery ended, with the reason of a failure. The Edit action opens the editor; Delete asks
first.

**The editor is a page, not a dialog**, at `/webhooks/new` and `/webhooks/:webhookId`. It
leaves the way the `ClientEditor` does: the close button in the card's header, Escape, or
Cancel -- and any other way out, see **Forms** above -- each asking first when there are unsaved edits, and going back to
the list; Save goes back after storing. The webhook is read
from `GET /api/v1/webhooks`; an id that is not there throws `NotFoundError`. The preview is
rendered with `renderTemplate` from `@dim/shared` — the code the server sends with — against
the sample event for the draft's kinds (`sampleWebhookRecord`, the one "Send Test" sends; its
kind is named above the preview), so the preview and the delivery cannot disagree. The sample
projects come with names of their own (`sampleProjectName`), so `{{event.projects}}` shows
something without depending on the projects that exist. "Send Test" posts the unsaved draft to
`/api/v1/webhooks/test`. See [Webhooks](guide/webhooks.md) for the template syntax.

### Settings (`pages/Settings.tsx`, `features/settings`)

System settings page, one section per tab: Client Tokens, Image Version Cache, Image Update Check, Container Auto-Update and Activity History. The tabs are the library's `useTabs`/`TabList`/`TabPanel`, and the open one is kept in the URL (`?tab=`). The sections live in `features/settings/components`; `features/settings/sections.ts` names the keys each one edits.

**Leaving with unsaved edits asks first**, for as long as any section has some; switching tabs is not leaving. A section's Save stays off while `sectionError` finds something the endpoint's schema would refuse, with the reason beside the button.

**Every section saves on its own.** Its Save sends only its own keys, and `PUT /api/v1/settings/cleanup` merges them into the stored block, so a section never writes over edits in another one. A tab with unsaved edits carries a dot. The manual maintenance runs act on the saved values, not on unsaved edits.

The page manages these settings, plus the manual maintenance actions:

| Setting                                      | Description                                                                   |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| `token_retention_days`                       | Days to keep used/expired registration tokens before cleanup.                 |
| `token_cleanup_interval_hours`               | Automatic token cleanup interval. `0` disables.                               |
| `image_version_cache_ttl_days`               | Max age of a cached `image_update_checks` entry.                              |
| `image_version_cache_cleanup_orphans`        | Whether orphaned cache rows are removed.                                      |
| `image_version_cache_cleanup_interval_hours` | Automatic cache cleanup scheduler interval.                                   |
| `image_update_check_interval_seconds`        | Interval for the image-update-check sweep. `0` disables.                      |
| `container_auto_update_cron`                 | The default auto-update schedule hosts and projects inherit.                   |
| `container_auto_update_label`                | Docker label that marks a container for auto-update.                          |
| `container_auto_update_delay_label`          | Docker label holding a per-container delay in days.                           |
| `notification_retention_days`                | Days to keep activity events.                                                 |
| `notification_retention_count`               | Minimum number of the newest activity events always kept.                     |
| `notification_cleanup_interval_hours`        | Automatic activity cleanup interval. `0` disables.                            |

- `GET/PUT /api/v1/settings/cleanup` — Fetch and save settings.
- `POST /api/v1/settings/cleanup/invalid-tokens` — Manually run the token cleanup.
- `POST /api/v1/settings/cleanup/image-version-cache` — Manually run the image version cache cleanup.
- `POST /api/v1/settings/cleanup/notifications` — Manually run the activity cleanup.
- `GET /api/v1/settings/scheduler-status` — Current status of all background schedulers.
- `POST /api/v1/settings/image-update-check/run` — Manually trigger the image-update-check sweep, including registries paused by a rate limit.
- `POST /api/v1/clients/:clientId/auto-update/run` — Ask one agent to run now.
- `POST /api/v1/settings/container-auto-update/validate-cron` — Validate a cron expression.
- `GET /api/v1/settings/container-auto-update/label` — The configured auto-update label on its own, read by `useAutoUpdateLabel` (`queries/autoUpdate.ts`) and kept in sync via `AUTO_UPDATE_LABEL_UPDATE`.

**Every tab with a scheduler follows one layout:** its settings, then one `SchedulerBox` headed "Scheduler". It shows Status (`Running…` or `Idle`), Last Run (with "manual" when a user started it), Next Run (or "Disabled") and Result, and, below a divider, the `ManualRun` row with its Run Now button. The box draws no field borders: its values are to read, not to edit. It reads `useSchedulerStatus` (`queries/scheduler.ts`); the result is worded by `describeRunResult` (`features/settings/lib/runResult.ts`), in red for a failed or interrupted run and in amber for one a rate limit cut short. Client Tokens, Image Version Cache, Image Update Check and Activity History have one; Container Auto-Update has none, because the server runs no auto-update.

The Image Update Check tab lists the registries above its scheduler box (`RegistryStatusTable`, fed from `useSchedulerStatus("image-update-check").registries`): one row per registry host with its image count, a status badge (`Ok`, `Paused`, `Error`), the last check, the next attempt while paused, the requests the registry says remain (only where it sends `ratelimit-remaining`) and the error. Docker Hub's `registry-1.docker.io` is shown as "Docker Hub" (`registryLabel` in `@dim/shared`). The scheduler box says whether the check runs; the table says why the images of one registry get no fresh answers.

The auto-update tab shows no schedule of the server's own, because it runs none, and no fleet
panel either. It is the settings and nothing else: the schedule hosts and projects inherit,
and the two labels. `AutoUpdateFleet`, which listed every client with one line per schedule,
is gone with the `GET .../container-auto-update/status` endpoint behind it — everything it
showed belongs to a host, and is therefore shown where that host is.

There is no way to ask an agent to run from the UI. The client row's play button is gone;
the row keeps its overflow menu with Reload, Edit and Delete. `POST /api/v1/clients/:clientId/auto-update/run`
and the toast machinery in `useAutoUpdateRunToasts` are still in place, but nothing calls
`markAutoUpdateRunAsked` any more — a run belongs to its host, and the host runs it on its
own schedule.

What the client list does report is the "Last Auto-Update" column, which
`useLatestAutoUpdateRuns` (`features/containers/hooks/useAutoUpdateRuns.ts`) derives from the
newest `autoupdate.run` event per client — out of the activity list, so a run that reports
itself moves the column without anybody polling. Next to it, the "Capabilities" column lists
what the connected agent declared, as it named it (`auto-update, project-query`); an offline
client shows `–`, because capabilities belong to the build on the wire, and a connected agent
that declares none shows "None".

There is nothing to enrol from a container list any more. A container takes part because
it carries the label or because the project it belongs to has auto-update switched on, so the
"Auto-Update" column in `ManagedContainers` and `ClientContainerList` is a statement rather
than a control: `AutoUpdateSourceCell` shows "Label", a link to the project, "Mixed" for a
row standing for instances that do not agree, or "–". `autoUpdate.ts` resolves that reading
from the container's own labels, mirroring what the server resolves for its sweep.

---

## 🎨 Styling & Theming

- **Tech Stack**: Tailwind CSS v3 with the `@stefgo/react-ui-components/tailwind-preset` as the base configuration.
- **Dark Mode**: Supported via the `class` strategy. The `dark` class is applied to the `<html>` tag, controlled by the library's `ThemeProvider`, which `App` mounts with `STORAGE_KEYS.theme`; `useTheme()` comes from the library as well. **A colour is one class, not two:** `bg-card` resolves per theme because the preset redefines the custom property behind it in its `.dark` block. The `…-dark` twins (`dark:bg-card-dark`) are gone with library 3.0, and the preset sets `darkMode` itself.
- **UI Library**: All generic components (Buttons, Inputs, Cards, Dashboard shell, etc.) come from `@stefgo/react-ui-components`. Domain-specific components live in `src/features/`.
- **Colours are roles, not palette values**: `bg-success`, `text-error`, `text-warning`, `text-info`, `bg-error-bg`. The library decides once what a role looks like in either theme, so a status dot cannot be a different green from one view to the next. Status pills are the `Badge` component.
- **Custom Tailwind Extensions**: the font family **Inter**, and nothing else. The font ships with the bundle (`@fontsource-variable/inter`, imported in `Main.tsx`), so opening the application makes no request to another origin, and the server's CSP names none. The former `app.text-footer` (`#444444`) only existed to stay readable on a white panel, and `shadow-glow-online` was a fixed green; the online dot uses `shadow-glow-success`, which the preset derives from the success token.
- **Tailwind Integration**: Tailwind merges `darkMode` and `safelist` from the preset, but **not** `content`: a `content` array in the app's config replaces the preset's rather than extending it. The library's own glob is therefore spread back in, or every class only the library uses is missing from the output:

```javascript
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", ...preset.content, ...localUiContent],
```

### Working against a local checkout of the UI library

By default Vite, Tailwind and the type check all use the **installed** `@stefgo/react-ui-components` (pinned in `server/frontend/package.json`). A build must not depend on a sibling checkout that CI and the Docker build do not have.

To develop the library and the app together, set `VITE_USE_LOCAL_UI=true` in the shell (optionally `VITE_UI_COMPONENTS_PATH`, default `../../../react-ui-components` relative to `server/frontend`):

| Tool | Installed package (default) | `VITE_USE_LOCAL_UI=true` |
| :--- | :--- | :--- |
| Vite | resolves the package from `node_modules` | aliases the import to `<path>/src/index.ts` |
| Tailwind | preset and `content` glob from the package | loads the checkout's `tailwind-preset.js` and scans `<path>/src/**/*.{ts,tsx}` |
| Type check | `npm run typecheck -w server/frontend` | `npm run typecheck:local-ui -w server/frontend` (`tsconfig.local-ui.json`) |

Always switch all three together; otherwise the compiler checks one version of the library while Vite bundles another. Tailwind swaps the preset with the glob, because the preset carries the theme — on the installed preset a local build would run new components on the old theme. `tsconfig.local-ui.json` cannot read environment variables and uses the default path. `compose.dev.yaml` already sets `VITE_USE_LOCAL_UI=true` for the dev container.

---

## 📦 UI Library (`@stefgo/react-ui-components`)

The app is heavily integrated with `@stefgo/react-ui-components`, pinned to an exact version (4.1.0). Components used:

| Component / Type       | Usage                                                     |
| :--------------------- | :-------------------------------------------------------- |
| `Dashboard`            | App shell with sidebar, user menu, theme toggle. Renders navigation; the pages come from the app's routes as `children`. |
| `DashboardPage`        | Type for a navigation entry (`{ id, path, nav }`).        |
| `LoginPage`            | Pre-built login form UI (local & OIDC).                   |
| `Card`                 | Generic surface card. `padding="none"` for a card that holds a table. |
| `StatCard`             | Clickable stat tile; `selected` marks the active one.     |
| `Input`                | Form input field.                                         |
| `Button`               | Button with variants (primary, secondary, danger).        |
| `DataTable`            | Table view with sorting and paging.                       |
| `DataMultiView`        | Switches between table, list and tree views for data.     |
| `DataTableDef`         | Column definitions for table mode.                        |
| `DataListDef` / `DataListColumnDef` | Column definitions for list mode.            |
| `DataAction`           | Typed action descriptors for data row operations.         |
| `ActionMenu`           | Context ("kebab") menu for per-item actions.              |
| `useActionMenu`        | Hook for `ActionMenu` state; supplies the trigger's `anchor`. |
| `useTabs` / `TabList` / `TabPanel` | The tabbed detail views (client, image, project). See below. |
| `Modal`                | The base every dialog is built from — focus trap, Escape, scroll lock, focus return. |
| `Wizard` / `WizardStep` | The step flow the `AddClientWizard` is built on.          |
| `Switch`               | On/off control — a project's auto-update, a host's own schedule. |
| `Select`               | Dropdown in the query builder and the forms.              |
| `useToast` / `ToastProvider` | Transient result messages raised from the shell.     |
| `cn`                   | Class-name join; the app uses it where it draws a surface itself. |
| `ConfirmProvider` / `useConfirm` | Every confirmation and failure notice. See [Confirmations](#confirmations). |
| `Badge`                | Status pill in one of five roles (`success`, `warning`, `error`, `info`, `neutral`). |
| `Checkbox`             | Checkbox with label, `indeterminate` for a partial selection.  |
| `ActionButton`         | Round icon button with a tooltip — close, copy, expand, kebab.  |
| `EntityHeader`         | One-row header of every detail page — `ClientOverview`, `ContainerOverview`, `ImageOverview`, `ProjectOverview`: title, badges, actions, and details that are either always visible or open on request. Whether they are open is kept per page type in `localStorage` (`dim.client.details`, `dim.container.details`, `dim.image.details`, `dim.project.details`). |
| `FOCUS_RING` / `FOCUS_RING_INSET` / `FOCUS_RING_NONE` | The focus ring for the few surfaces the app still draws itself: an inline chip, a tab, a menu entry. Every library component brings its own. |

**The data views own sorting and paging.** A view receives the complete set in `data` and takes the page *after* sorting, which is what makes a column sort cover every row instead of the ten on screen. The page state lives in the view, configured through the library's `listPagination(PAGE_SIZE.…)` — 20 rows for a list that is a page of its own, 10 for one inside a tab; `usePagination` is only for holding it outside, and the app does not need it. Sorting, search and view mode follow the same shape: `sort={{ defaultValue: [...] }}`, `search={{ value, onChange }}`, `viewMode={{ persist: { key, scope: "local" } }}` — the persistence vocabulary that replaced the bare `storageKey` in library 4.0; `scope: "local"` is what `storageKey` did, so a chosen view mode survived the move.

**The tabs are the library's.** The tabbed detail pages — `ClientOverview`, `ImageOverview`, `ProjectOverview` — drive their `StatCard` headers and the panels below from one `useTabs({ tabs, value, onChange })`: it supplies the roles, the tab-to-panel wiring, the roving tabindex and the arrow keys, and the cards take their semantics from its `tabProps` rather than claiming to be toggles. `TabPanel` keeps the behaviour the app's own former `TabPanel` existed for, now under the name `visited`: a panel that has been opened once stays mounted, so a tab's search, sort and page survive a switch away and back. The active tab itself is a URL parameter, so a reload and a shared link land on the same tab.
