This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/
│   ├── app/                              # Application shell
│   │   ├── App.tsx                       # Main router, navGroups and pages configuration
│   │   └── context/
│   │       ├── ThemeContext.tsx          # Dark/light theme management
│   │       └── WebSocketContext.tsx      # WebSocket connection for real-time updates
│   ├── auth/
│   │   └── AuthContext.tsx               # Authentication state & context
│   ├── clients/                          # Client management
│   │   └── components/
│   │       ├── ManagedClients.tsx        # Container for client list & actions
│   │       ├── ClientList.tsx            # Paginated client data table
│   │       ├── ClientOverview.tsx        # Detail view for a single client (tabs)
│   │       ├── ClientEditor.tsx          # Form for editing a client
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

The `AppLayout` uses the `Dashboard` component from `@stefgo/react-ui-components`, which renders the sidebar navigation and switches page content based on the active route. Navigation is organised into `navGroups` (`resources`, `notification`, `admin`) and each page contributes a `DashboardPage` entry with its own nav metadata (label, icon, optional badge).

---

## 🔐 Authentication

Authentication is managed via the `AuthContext` (`src/features/auth/AuthContext.tsx`).

- **Token Storage**: The JWT token is stored in `localStorage`.
- **Provider**: The `AuthProvider` wraps the app and provides `token`, `login(token)`, and `logout()`.
- **Login Flow**:
    1. **Local**: POST to `/api/login` → Token is received → `login(token)`.
    2. **OIDC**: Redirect to `/api/auth/login` → Provider callback with code → Backend exchanges code for token → Token is passed to frontend via URL parameter → `login(token)`.
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

The `WebSocketContext` (`src/features/app/context/WebSocketContext.tsx`) maintains a persistent WebSocket connection to the backend (`ws://.../dashboard`). Incoming messages are dispatched to the stores:

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

The container component for the client management view. Coordinates between the client list, editor, and token generation.

- **Functionality**:
    - Displays the list of registered clients (`ClientList`).
    - Opens the client editor (`ClientEditor`) for renaming a client.
    - Triggers registration token generation (POST to `/api/v1/tokens`) and shows the result in a `TokenModal`.
    - Deletes clients.

### ClientOverview (`features/clients`)

The detail view for a single client, shown when navigating to `/client/:clientId`. Uses `Card` and `ActionMenu` from `@stefgo/react-ui-components` and renders four tabs backed by the client's entry in `useDockerStore`:

- `ClientContainerList` — containers, with start/stop/restart/remove/recreate actions.
- `ClientImageList` — images, with pull/update/remove and prune.
- `ClientVolumeList` — volumes, with remove.
- `ClientNetworkList` — networks, with remove.

### ManagedContainers (`features/containers`)

Aggregates containers from every connected client into a tree (client → containers). Supports search, pagination, a state-based status dot, per-row container actions, and a "Check All" action that runs image update checks for every distinct image in view.

### ManagedImages & ImageOverview (`features/images`)

`ManagedImages` renders a three-level tree: Repository → Tag → Digest, with per-node actions (Check Update, Pull & Recreate, Remove, Prune). Update status animations are driven by `useDockerStore.checkingImages` and `imageUpdateStatus`, scoped per digest. Filtering via the search bar traverses the full tree so matches deep in a tag/digest still surface.

`ImageOverview` is the dedicated detail page (`/image/:imageId`) with `StatCard`s and two `DataMultiView` tables: one for the image's tags/digests and one for the containers that use them.

### NotificationsView (`features/notifications`)

Dedicated page showing all entries from `useNotificationStore`, grouped by level and collapsible per row. Badge count in the sidebar reflects `notifications.length`. `useConsoleErrorCapture` forwards `console.error` calls into the store so uncaught UI errors become visible without opening devtools.

### UserOverview (`features/users`)

Manages user accounts. Supports creating, editing, and deleting users via a `UserDialog` form. Lists users with pagination via `UserList`.

### TokenOverview (`features/tokens`)

Manages API tokens. Supports generating new tokens (displayed once in `TokenModal`) and deleting existing tokens. Lists tokens with pagination via `TokenList`.

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
- **Dark Mode**: Supported via the `class` strategy. The `dark` class is applied to the `<html>` tag, controlled by `ThemeContext`.
- **UI Library**: All generic components (Buttons, Inputs, Cards, Dashboard shell, etc.) come from `@stefgo/react-ui-components`. Domain-specific components live in `src/features/`.
- **Custom Tailwind Extensions**:
    - `app.text-footer` — Custom footer text color (`#444444`).
    - `shadow-glow-online` — Green glow effect (`rgba(34,197,94,0.4)`) for online status indicators.
    - Font family: **Inter**.
- **Tailwind Integration**: To include library-specific styles in the production build, `tailwind.config.js` uses dynamic path resolution:

```javascript
const uiLibDist = path.join(
    path.dirname(
        require.resolve("@stefgo/react-ui-components/tailwind-preset"),
    ),
    "dist/**/*.{js,mjs}",
);
```

---

## 📦 UI Library (`@stefgo/react-ui-components`)

The app is heavily integrated with `@stefgo/react-ui-components` v2.x. Components used:

| Component / Type       | Usage                                                     |
| :--------------------- | :-------------------------------------------------------- |
| `Dashboard`            | Main app shell with sidebar, user menu, theme toggle.     |
| `DashboardPage`        | Type for configuring sidebar navigation items.            |
| `LoginPage`            | Pre-built login form UI (local & OIDC).                   |
| `Card`                 | Generic surface card for content sections.                |
| `DataCard`             | Card variant for data display sections.                   |
| `Input`                | Form input field.                                         |
| `Button`               | Button with variants (primary, secondary).                |
| `DataMultiView`        | Switches between table and list views for data.           |
| `DataTableDef`         | Column definitions for `DataMultiView` table mode.        |
| `DataListDef` / `DataListColumnDef` | Column definitions for list mode.            |
| `DataAction`           | Typed action descriptors for data row operations.         |
| `ActionMenu`           | Context ("kebab") menu for per-item actions.              |
| `useActionMenu`        | Hook for managing `ActionMenu` open/close state.          |
