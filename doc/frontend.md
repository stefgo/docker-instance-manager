This documentation describes in detail the architecture, components, and state management of the frontend (`server/frontend`). The application is a **Single Page Application (SPA)** based on React, Vite, TypeScript, and Tailwind CSS.

## 📂 Project Structure

The structure follows a **Feature-First Approach**, where code belonging to a specific domain area is grouped together.

```
src/
├── features/
│   ├── app/              # Application shell
│   │   ├── App.tsx       # Main router and layout configuration
│   │   └── context/
│   │       ├── ThemeContext.tsx      # Dark/light theme management
│   │       └── WebSocketContext.tsx  # WebSocket connection for real-time updates
│   ├── auth/
│   │   └── AuthContext.tsx           # Authentication state & context
│   ├── clients/          # Client management
│   │   └── components/
│   │       ├── ManagedClients.tsx    # Container for client list & actions
│   │       ├── ClientList.tsx        # Paginated client data table
│   │       ├── ClientOverview.tsx    # Detail view for a single client
│   │       ├── ClientEditor.tsx      # Form for editing a client
│   │       └── ClientSelect.tsx      # Client dropdown selector
│   ├── users/            # User management
│   │   └── components/
│   │       ├── UserOverview.tsx      # Container for user CRUD operations
│   │       ├── UserList.tsx          # Paginated user list
│   │       └── UserDialog.tsx        # Create/edit user dialog
│   └── tokens/           # API token management
│       └── components/
│           ├── TokenOverview.tsx     # Container for token management
│           ├── TokenList.tsx         # Paginated token list
│           └── TokenModal.tsx        # Modal showing a newly generated token
├── pages/                # Route entry points
│   ├── Login.tsx         # Authentication page (Local & OIDC)
│   └── Settings.tsx      # System settings page
├── stores/               # Global State Management (Zustand)
│   ├── useClientStore.ts # Client list & real-time online/offline status
│   └── useUIStore.ts     # UI state (sidebar collapse, persisted)
├── hooks/
│   └── usePagination.ts  # Custom hook for pagination logic
└── utils.ts              # General utility functions
```

---

## 🚦 Routing & Navigation

Routing is controlled via `react-router-dom` v7 in `App.tsx`.

| Path                | Component       | Description                                       |
| :------------------ | :-------------- | :------------------------------------------------ |
| `/login`            | `Login.tsx`     | Authentication page (Local & OIDC).               |
| `/`                 | `AppLayout`     | Home — redirects to clients view.                 |
| `/clients`          | `AppLayout`     | Client management overview.                       |
| `/client/:clientId` | `AppLayout`     | Detail view of a specific client.                 |
| `/users`            | `AppLayout`     | User management.                                  |
| `/tokens`           | `AppLayout`     | API token management.                             |
| `/settings`         | `AppLayout`     | System settings (retention policies, etc.).       |

All routes except `/login` are wrapped in a `ProtectedRoute` component that redirects unauthenticated users to `/login`.

The `AppLayout` uses the `Dashboard` component from `@stefgo/react-ui-components`, which renders the sidebar navigation and switches page content based on the active route.

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
- **`useUIStore`**: Manages global UI state — currently sidebar collapse state. Uses Zustand's `persist` middleware to save state to `localStorage` (`dim-ui-storage`).

### Real-time Updates (WebSocket)

The `WebSocketContext` (`src/features/app/context/WebSocketContext.tsx`) maintains a persistent WebSocket connection to the backend (`ws://.../dashboard`). Incoming messages update `useClientStore` directly (e.g., client online/offline status changes) without requiring a full API refetch.

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

The detail view for a single client, shown when navigating to `/client/:clientId`. Uses `Card` and `ActionMenu` components from `@stefgo/react-ui-components`.

### UserOverview (`features/users`)

Manages user accounts. Supports creating, editing, and deleting users via a `UserDialog` form. Lists users with pagination via `UserList`.

### TokenOverview (`features/tokens`)

Manages API tokens. Supports generating new tokens (displayed once in `TokenModal`) and deleting existing tokens. Lists tokens with pagination via `TokenList`.

### Settings (`pages/Settings.tsx`)

System settings page with tabbed interface (`react-tabs`). Manages retention policies:

| Setting                          | Description                              |
| :------------------------------- | :--------------------------------------- |
| `retention_invalid_tokens_days`  | Days to keep expired/invalid tokens.     |
| `retention_invalid_tokens_count` | Minimum count of invalid tokens to keep. |
| `retention_job_history_days`     | Days to keep job execution history.      |
| `retention_job_history_count`    | Minimum count of job history to keep.    |

- `GET/PUT /api/v1/settings/cleanup` — Fetch and save retention settings.
- `POST /api/v1/settings/cleanup` — Trigger a manual cleanup job.

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
