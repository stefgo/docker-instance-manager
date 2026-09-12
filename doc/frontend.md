This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/
│   ├── app/                              # Application shell
│   │   ├── App.tsx                       # Main router, navGroups and pages configuration
│   │   └── context/
│   │       ├── ThemeContext.ts           # Theme context object and useTheme hook
│   │       ├── ThemeProvider.tsx         # Dark/light theme management
│   │       ├── WebSocketContext.ts       # WebSocket context object and useWebSocket hook
│   │       └── WebSocketProvider.tsx     # WebSocket connection for real-time updates
│   ├── auth/
│   │   ├── AuthContext.ts                # Auth context object and useAuth hook
│   │   └── AuthProvider.tsx              # Authentication state
│   ├── clients/                          # Client management
│   │   └── components/
│   │       ├── ManagedClients.tsx        # Container for client list & actions
│   │       ├── ClientList.tsx            # Paginated client data table
│   │       ├── ClientOverview.tsx        # Detail view for a single client (tabs)
│   │       ├── ClientEditor.tsx          # Form for editing a client
│   │       ├── StatusDot.tsx             # Online indicator, shared by every view that shows one
│   │       └── add-client/               # One wizard for both connection modes
│   │           ├── AddClientWizard.tsx   # Mode choice, then the inbound or outbound branch
│   │           ├── useAddClientForm.ts   # Form state, held above the wizard
│   │           └── steps/                # StepConnectionMode, StepInboundDetails, StepOutboundDetails
│   │       ├── ClientContainerList.tsx   # Containers tab in ClientOverview
│   │       ├── ClientImageList.tsx       # Images tab in ClientOverview
│   │       ├── ClientVolumeList.tsx      # Volumes tab in ClientOverview
│   │       └── ClientNetworkList.tsx     # Networks tab in ClientOverview
│   ├── containers/                       # Cross-client container view
│   │   ├── components/
│   │   │   └── ManagedContainers.tsx     # Tree-grouped containers with per-row actions
│   │   └── hooks/
│   │       └── useContainersData.ts      # Aggregates container rows from docker states
│   ├── images/                           # Cross-client image view
│   │   ├── components/
│   │   │   ├── ManagedImages.tsx         # Repository → Tag → Digest tree view
│   │   │   ├── ImageRepositoryList.tsx   # Repository-level rows
│   │   │   ├── ImageList.tsx             # Per-tag rows
│   │   │   ├── ImageContainerList.tsx    # Containers using a tag
│   │   │   ├── ImageOverview.tsx         # Detail view with stats and tables
│   │   │   └── UpdateIcon.tsx            # Animated update-check indicator
│   │   └── hooks/
│   │       └── useImagesData.ts          # Builds the image tree from docker states
│   ├── notifications/                    # In-app notifications
│   │   ├── components/
│   │   │   └── NotificationsView.tsx     # Dedicated notifications page
│   │   └── hooks/
│   │       └── useConsoleErrorCapture.ts # Mirrors console.error into the store
│   ├── users/                            # User management
│   │   └── components/
│   │       ├── UserOverview.tsx
│   │       ├── UserList.tsx
│   │       └── UserDialog.tsx
│   └── tokens/                           # Registration token management
│       └── components/
│           ├── TokenOverview.tsx
│           ├── TokenList.tsx
│           └── TokenModal.tsx
├── lib/
│   └── apiFetch.ts                       # fetch for authenticated endpoints, central 401 handling
├── pages/                                # Route entry points
│   ├── Login.tsx                         # Authentication page (Local & OIDC)
│   └── Settings.tsx                      # System settings page
├── stores/                               # Global state management (Zustand)
│   ├── useClientStore.ts                 # Registered clients and online/offline status
│   ├── useDockerStore.ts                 # Per-client Docker states, actions and update checks
│   ├── useNotificationStore.ts           # In-app notifications
│   └── useUIStore.ts                     # UI state (sidebar collapse, persisted)
└── utils.ts                              # General utility functions
```

---

## 🚦 Routing & Navigation

Routing is controlled via `react-router-dom` v7 in `App.tsx`.

| Path                | Component       | Description                                                         |
| :------------------ | :-------------- | :------------------------------------------------------------------ |
| `/login`            | `Login.tsx`     | Authentication page (Local & OIDC).                                 |
| `/`                 | `AppLayout`     | Home — renders the clients view.                                    |
| `/clients`          | `AppLayout`     | Registered clients overview.                                        |
| `/client/:clientId` | `AppLayout`     | Detail view of a specific client (containers/images/volumes/nets).  |
| `/containers`       | `AppLayout`     | Aggregated containers across all clients.                           |
| `/images`           | `AppLayout`     | Aggregated images as a Repository → Tag → Digest tree.              |
| `/image/:imageId`   | `AppLayout`     | Image detail view (stats, containers using it).                     |
| `/notifications`    | `AppLayout`     | In-app notifications (errors/warnings/infos).                       |
| `/users`            | `AppLayout`     | User management.                                                    |
| `/tokens`           | `AppLayout`     | Registration token management.                                      |
| `/settings`         | `AppLayout`     | System settings (retention policies, image cache, etc.).            |

All routes except `/login` are wrapped in a `ProtectedRoute` component that redirects unauthenticated users to `/login`.

The `AppLayout` uses the `Dashboard` component from `@stefgo/react-ui-components`. Since library 3.0 it renders **only the navigation** and highlights the entry whose `path` matches; the page content is a `<Routes>` element passed to it as `children`. A `DashboardPage` entry is therefore `{ id, path, nav }` — path (with `:param` segments), plus label, icon and an optional badge. Navigation is organised into `navGroups` (`resources`, `notification`, `admin`).

A path no entry claims reaches the catch-all route and renders a **404 card** that names the path and leads back to the clients view. The Dashboard used to fall back to its first page silently, so an unknown URL looked like the clients page.

**The pages are loaded on demand** (`React.lazy` with a `Suspense` fallback), so a chunk arrives with the route that needs it. The previous shape passed every page as an element to the Dashboard, which built the tree of all nine on every render of the shell even though one was on screen.

Each route takes what it needs from the stores itself: `ClientsRoute` and `ClientDetailRoute` read `useClientStore`, `ImageDetailRoute` reads the `:imageId` parameter. A client id that is not in the store yet renders the list rather than redirecting, because a link to a client arrives before the client list does.

---

## 🔐 Authentication

Authentication is managed by the `AuthProvider` (`src/features/auth/AuthProvider.tsx`); components read it through `useAuth` from `AuthContext.ts`.

Each context is split the same way: the context object and its hook live in a JSX-free `.ts` module, the provider component in a `.tsx` file of its own. A module that exports a component next to a hook cannot be swapped by Vite's Fast Refresh, and `react-refresh/only-export-components` reports it as an error.

- **Session**: The JWT never reaches JavaScript. The server keeps it in the httpOnly cookie `dim_session`, which the browser sends with every request and with the WebSocket handshake. The page only reads the flag cookie `dim_auth`, which carries no secret, to decide whether to render the login form. A JWT left in `localStorage` by an earlier version is removed on load.
- **Provider**: The `AuthProvider` wraps the app and provides `isAuthenticated`, `user` (`{ id, username }` from `GET /api/v1/me`, `null` until it answers), `login()` and `logout()`. `logout()` clears the flag, calls `POST /api/auth/logout` to remove the httpOnly cookie, and returns to `/login`.
- **Login Flow**:
    1. **Local**: POST to `/api/login` → the server sets the cookies → `login()`.
    2. **OIDC**: Redirect to `/api/auth/login` → provider callback with code → the backend exchanges the code, sets the cookies and redirects to `/`. Nothing is passed in the URL.
- **Stale flag**: The flag can outlive the session (a restarted server with a new `jwtSecret`, an expired token). The first request, `/api/v1/me`, then answers `401` and `apiFetch` logs out.
- **API calls**: Every request to an authenticated endpoint goes through `apiFetch` (`src/lib/apiFetch.ts`). It sends the request with `credentials: "same-origin"`, so the session cookie goes along, and reacts to `401` in one place: it calls the `logout` the `AuthProvider` registered with `setUnauthorizedHandler` and throws `SessionExpiredError`, so the router lands on `/login`. Stores and components therefore take no token parameter. `Login.tsx` keeps plain `fetch` on purpose — `/api/login` and `/api/auth/config` are unauthenticated, and a wrong password must produce an error message, not a logout.
- **Expiry**: Besides the `401` handling, the `AuthProvider` logs out at the `expiresAt` that `/api/v1/me` reports, because a dashboard fed only by the WebSocket may not send a request for a long time.
- **Login UI**: The `Login.tsx` page uses the pre-built `LoginPage` component from `@stefgo/react-ui-components`, configured with app title, auth type, and handler callbacks.

---

## 🗂️ State Management

### Modular State Management

We use **Zustand** split into specialized stores to maintain a clean, reactive state.

- **`useClientStore`**: Holds the master list of registered clients and their real-time online/offline status. Provides `fetchClients`, `deleteClient`, `updateClient`, and `setClients` (used by WebSocket updates).
- **`useDockerStore`**: Holds the per-client `DockerState` (`dockerStates: Record<clientId, DockerState>`). Provides `fetchDockerState` / `refreshDockerState` (REST), `checkImageUpdate`, `updateImage`, `removeImage`, and `containerAction`. Carries over stale `updateCheck` values across incoming state snapshots so update indicators remain stable. Tracks `checkingImages` and `imageUpdateStatus` maps so the UI can animate in-flight checks and pulls per digest.
- **`useNotificationStore`**: Append-only in-app notification list (`error` / `warning` / `info`) with expand/remove/clear. Fed by `useConsoleErrorCapture` and by error handlers inside other stores.
- **`useUIStore`**: Manages global UI state — currently sidebar collapse state. Uses Zustand's `persist` middleware to save state to `localStorage` (`dim-ui-storage`).

### Real-time Updates (WebSocket)

The `WebSocketProvider` (`src/features/app/context/WebSocketProvider.tsx`) maintains a persistent WebSocket connection to the backend (`ws://.../ws/dashboard`), authenticated by the session cookie the browser sends with the handshake. It also hands `user.id` to `useNotificationStore.setCurrentUserId`. Incoming messages are dispatched to the stores:

| Event                  | Handler                                          |
| :--------------------- | :----------------------------------------------- |
| `CLIENTS_UPDATE`       | `useClientStore.setClients`                      |
| `DOCKER_STATE_UPDATE`  | `useDockerStore.setDockerState(clientId, state)` |
| `DOCKER_ACTION_RESULT` | Consumed by action promises in `useDockerStore`  |
| `SCHEDULER_STATUS_UPDATE` | `useSchedulerStore.setImageUpdateCheckStatus` / `setContainerAutoUpdateStatus` (partial, per-key) |
| `MANUAL_AUTO_UPDATE_UPDATE` | `useAutoUpdateStore.setManualEntries` + `setLabelFilter` |

---

## 🧩 Feature Details

### ManagedClients (`features/clients`)

The container component for the client management view. Coordinates between the client list, the editor and the add-client wizard.

- **Functionality**:
    - Displays the list of registered clients (`ClientList`).
    - Opens the client editor (`ClientEditor`) for renaming a client, for inbound clients editing or switching off the address its connections must come from, and for outbound clients the address the server dials. `Escape` leaves the editor and discards, as the Cancel button beside it does; while anything has been changed the footer says so, which is the safety net for both. The field is validated with `Ipv4OrCidrSchema` from `@dim/shared`, the same rule the server applies; server errors are shown in the form. An allowed address that would not let `inboundLastIp` — the address of the agent's last successful connect — back in is called out beneath the field, using the same `isIpAllowed` the server decides with. It does not block saving: the value is well-formed and the agent may have moved on purpose, so this is a consequence worth seeing, not a reason to refuse.
    - Opens the `AddClientWizard` — one flow for both connection modes, replacing the former "Add Outbound Client" dialog and "Generate New Token" button.
    - Deletes clients after a confirmation that says what goes (the server-side record and cached Docker state) and what stays (everything on the host; the agent keeps running but is refused).

### LoadingIndicator (`components`)

"Something is on its way", for a view with nothing to show yet. The three places that needed it had each solved it differently — a line of muted text for a lazy route, a sentence in a paragraph while the image list filled up, a third wording while a client's first Docker snapshot arrived — so none of them looked like waiting and no two looked alike. `role="status"` announces the label when it appears; the spinner is decorative.

### StatusDot (`features/clients`)

The dot that says whether the server currently holds a connection to a client. It stood inline in five places — both views of the client list, the header of the detail page, and the client labels of the image lists — and had already drifted; the glow and the pulse were five copies of one rule.

It takes a boolean rather than a client's status field, because two of the call sites have only the boolean: the comparison belongs to the caller, the appearance belongs to the component. The dot is `aria-hidden`, since every place that shows it also names the state in text.

### Dialogs

`Modal` from `@stefgo/react-ui-components` is what a dialog is built from. The three hand-built overlays that preceded it (`fixed inset-0 bg-black/80 …`) had no focus trap, no Escape, no scroll lock and no focus return.

- `UserDialog` turns `closeOnOverlayClick` off: it holds unsaved input, and a stray click beside it should not discard the work.
- `TokenModal` turns `closeOnEscape` off as well and hides the close button. The token is in the clear exactly once, so dismissing the dialog is not a way out but the loss of what the flow was for; the button below it is the only way on.

Editors that live in the workspace rather than in a dialog bring their own `Escape` on a `window` listener — see `AddClientWizard` and `ClientEditor`.

### AddClientWizard (`features/clients/components/add-client`)

One flow for both connection modes, built on `Wizard` from `@stefgo/react-ui-components`. Step 1 is the decision about which side opens the connection; step 2 is the branch that follows from it. As two separate entry points this was a decision the operator had to have made before reaching a form.

It lives in the workspace rather than in a modal, because the two branches end in different things: a token to carry to another machine, or a connection attempt that may fail with a reason worth reading.

- **Inbound branch**: display name and allowed address for the client the token will create. Both optional — without them the agent's hostname names the client and the address it registers from becomes its allowed address. Ends in a `TokenModal`, which shows the token once.
- **Outbound branch**: hostname, target address and registration secret; finishing dials the agent straight away, and a refusal is shown on the step with the agent's own reason.
- The wizard renders only the current step, so the form state lives above it in `useAddClientForm` — a step holding its inputs in its own `useState` would lose them on Back.
- Both fields that the server validates are checked in the form with the same functions the endpoints use (`Ipv4OrCidrSchema`, `normaliseTargetAddress` from `@dim/shared`).
- `Escape` leaves the wizard. The listener sits on `window`, one level further out than menus and dialogs that listen on `document` and stop the event there, so an open select closes itself without taking the wizard with it. It is off while the token is on screen: that dialog is acknowledged by button, because the token is shown exactly once.

### ClientOverview (`features/clients`)

The detail view for a single client, shown when navigating to `/client/:clientId`. Uses `Card` and `ActionMenu` from `@stefgo/react-ui-components` and renders four tabs backed by the client's entry in `useDockerStore`:

- `ClientContainerList` — containers, with start/stop/restart/remove/recreate actions.
- `ClientImageList` — images, with pull/update/remove and prune.
- `ClientVolumeList` — volumes, with remove.
- `ClientNetworkList` — networks, with remove.

Every tab hands its actions to `ClientOverview.handleAction`. Remove actions (container, image, volume, network) stop there and open a `ConfirmDialog` naming the entry and the consequence: a container is removed with force, even while running; image, volume and network are removed without force, so Docker refuses them while in use. All other actions are sent at once.

### ManagedContainers (`features/containers`)

Aggregates containers from every connected client into a tree (client → containers). Supports search, pagination, a state-based status dot, per-row container actions, and a "Check All" action that runs image update checks for every distinct image in view. Remove asks first; on a container row it removes every instance of that name, and the dialog says on how many clients.

### ManagedImages & ImageOverview (`features/images`)

`ManagedImages` renders a three-level tree: Repository → Tag → Digest, with per-node actions (Check Update, Pull & Recreate, Remove, Prune). Update status animations are driven by `useDockerStore.checkingImages` and `imageUpdateStatus`, scoped per digest. Filtering via the search bar traverses the full tree so matches deep in a tag/digest still surface. Both prune actions (per row and the toolbar button) ask first and name how many images go.

`ImageOverview` is the dedicated detail page (`/image/:imageId`) with `StatCard`s and two `DataMultiView` tables: one for the image's tags/digests and one for the containers that use them. Its Prune button asks first as well.

### NotificationsView (`features/notifications`)

Dedicated page showing all entries from `useNotificationStore`, grouped by level and collapsible per row. Badge count in the sidebar reflects `notifications.length`. `useConsoleErrorCapture` forwards `console.error` calls into the store so uncaught UI errors become visible without opening devtools.

### UserOverview (`features/users`)

Manages user accounts. Supports creating, editing, and deleting users via a `UserDialog` form. Deleting asks first; the dialog states that a session the account already holds stays valid until it expires, because the API checks only the JWT. For the last remaining user a second dialog explains why it cannot be deleted instead of sending the request. Lists users with pagination via `UserList`.

### TokenOverview (`features/tokens`)

Lists registration tokens with pagination via `TokenList` and deletes them. Tokens are **issued in the `AddClientWizard`**, not here: that is where the two defaults a token carries — display name and allowed address — are entered, and a second entry point would only produce tokens without them. The list shows both defaults per token, or "From the agent" for a token that carries neither.

### Settings (`pages/Settings.tsx`)

System settings page with tabbed interface (`react-tabs`). Manages retention and image cache settings, security networks, and manual maintenance actions:

| Setting                                      | Description                                                                   |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| `retention_invalid_tokens_days`              | Days to keep used/expired registration tokens before cleanup.                 |
| `retention_invalid_tokens_count`             | Minimum number of most-recent invalid tokens to always retain.                |
| `image_version_cache_ttl_days`               | Max age of a cached `image_update_checks` entry.                              |
| `image_version_cache_cleanup_orphans`        | Whether orphaned cache rows are removed.                                      |
| `image_version_cache_cleanup_interval_hours` | Automatic cache cleanup scheduler interval.                                   |
| `image_update_check_interval_seconds`        | Interval for the image-update-check sweep. `0` disables.                      |
| `container_auto_update_cron`                 | Cron expression for the container auto-update scheduler.                      |
| `container_auto_update_label`                | Docker label that marks a container for auto-update.                          |
| `container_auto_update_refresh_check`        | Whether to re-check image updates before updating.                            |

- `GET/PUT /api/v1/settings/cleanup` — Fetch and save settings.
- `POST /api/v1/settings/cleanup/invalid-tokens` — Manually run the token cleanup.
- `POST /api/v1/settings/cleanup/image-version-cache` — Manually run the image version cache cleanup.
- `GET /api/v1/settings/scheduler-status` — Current status of all background schedulers.
- `POST /api/v1/settings/image-update-check/run` — Manually trigger the image-update-check sweep.
- `POST /api/v1/settings/container-auto-update/run` — Manually trigger the container auto-update sweep.
- `POST /api/v1/settings/container-auto-update/validate-cron` — Validate a cron expression.
- `GET /api/v1/settings/container-auto-update/eligible` — List label-matched + manually enrolled containers (read-only, used for the scheduler run).
- `GET /api/v1/containers/auto-update/manual` — List manual enrollments + current label filter.
- `POST /api/v1/containers/auto-update/manual` — Batch enroll containers (`{ entries: [{clientId, containerId}, …] }`).
- `DELETE /api/v1/containers/auto-update/manual` — Batch unenroll containers.

Manual enrollment is now managed in the container management UI (parent rows in
`ManagedContainers` toggle all their non-label children at once; `ClientContainerList`
exposes a per-row toggle and a menu entry). The store `useAutoUpdateStore` caches
the manual set + label filter and is kept in sync via `MANUAL_AUTO_UPDATE_UPDATE`
WS broadcasts.

---

## 🎨 Styling & Theming

- **Tech Stack**: Tailwind CSS v3 with the `@stefgo/react-ui-components/tailwind-preset` as the base configuration.
- **Dark Mode**: Supported via the `class` strategy. The `dark` class is applied to the `<html>` tag, controlled by `ThemeProvider`. **A colour is one class, not two:** `bg-card` resolves per theme because the preset redefines the custom property behind it in its `.dark` block. The `…-dark` twins (`dark:bg-card-dark`) are gone with library 3.0, and the preset sets `darkMode` itself.
- **UI Library**: All generic components (Buttons, Inputs, Cards, Dashboard shell, etc.) come from `@stefgo/react-ui-components`. Domain-specific components live in `src/features/`.
- **Colours are roles, not palette values**: `bg-success`, `text-error`, `text-warning`, `text-info`, `bg-error-bg`. The library decides once what a role looks like in either theme, so a status dot cannot be a different green from one view to the next. Status pills are the `Badge` component.
- **Custom Tailwind Extensions**: the font family **Inter**, and nothing else. The former `app.text-footer` (`#444444`) only existed to stay readable on a white panel, and `shadow-glow-online` was a fixed green; the online dot uses `shadow-glow-success`, which the preset derives from the success token.
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

The app is heavily integrated with `@stefgo/react-ui-components`, pinned to an exact version (3.0.1). Components used:

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
| `ConfirmDialog`        | Asks before a destructive action. Replaced the local stand-in that existed while the app was on 2.16. |
| `Badge`                | Status pill in one of five roles (`success`, `warning`, `error`, `info`, `neutral`). |
| `Checkbox`             | Checkbox with label, `indeterminate` for a partial selection.  |
| `ActionButton`         | Round icon button with a tooltip — close, copy, expand, kebab.  |
| `FOCUS_RING` / `FOCUS_RING_INSET` / `FOCUS_RING_NONE` | The focus ring for the few surfaces the app still draws itself: an inline chip, a tab, a menu entry. Every library component brings its own. |

**The data views own sorting and paging.** A view receives the complete set in `data` and takes the page *after* sorting, which is what makes a column sort cover every row instead of the ten on screen. The page state lives in the view (`pagination={{ defaultValue: { pageSize: 10 }, hideOnSinglePage: true }}`); `usePagination` is only for holding it outside, and the app does not need it. Sorting, search and view mode follow the same shape: `sort={{ defaultValue: [...] }}`, `search={{ value, onChange }}`, `viewMode={{ storageKey }}`.
