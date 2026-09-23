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
│   │   ├── confirmations.ts              # Remove, delete-client and discard texts
│   │   ├── dockerRemove.ts               # The actions that ask before they are sent
│   │   └── components/
│   │       ├── ManagedClients.tsx        # Container for client list & actions
│   │       ├── ClientList.tsx            # Paginated client data table
│   │       ├── ClientOverview.tsx        # Detail view for a single client (tabs)
│   │       ├── ClientIdentityCard.tsx    # The client's own fields, edited and saved in place
│   │       ├── ClientEditor.tsx          # Form for editing a client
│   │       ├── ClientLabel.tsx           # Dot and name of a client, for the rows that name one
│   │       ├── StatusDot.tsx             # Online indicator, shared by every view that shows one
│   │       ├── ClientContainerList.tsx   # Containers tab in ClientOverview
│   │       ├── ClientImageList.tsx       # Images tab in ClientOverview
│   │       ├── ClientVolumeList.tsx      # Volumes tab in ClientOverview
│   │       ├── ClientNetworkList.tsx     # Networks tab in ClientOverview
│   │       └── add-client/               # One wizard for both connection modes
│   │           ├── AddClientWizard.tsx   # Mode choice, then the inbound or outbound branch
│   │           ├── useAddClientForm.ts   # Form state, held above the wizard
│   │           └── steps/                # StepConnectionMode, StepInboundDetails, StepOutboundDetails
│   ├── containers/                       # Cross-client container view
│   │   ├── autoUpdate.ts                 # Why a container takes part: label, project, or not at all
│   │   ├── confirmations.ts              # Remove-container text
│   │   ├── containerState.ts             # State dot colours and the page path of a row
│   │   ├── components/
│   │   │   ├── ManagedContainers.tsx     # Tree-grouped containers with per-row actions
│   │   │   ├── ContainerOverview.tsx     # Detail view of one container and its instances
│   │   │   ├── ContainerStatus.tsx       # The docker-ps status text, derived and kept counting
│   │   │   └── AutoUpdateSourceCell.tsx  # Renders that reading, shared by both container lists
│   │   └── hooks/
│   │       ├── useContainersData.ts      # Aggregates container rows from docker states
│   │       ├── useContainerActions.ts    # Check, pull, start, stop, remove -- list and page alike
│   │       ├── useAutoUpdateRuns.ts      # The newest autoupdate.run event per client
│   │       └── useAutoUpdateRunToasts.ts # Speaks for a run from the shell, minutes later
│   ├── images/                           # Cross-client image view
│   │   ├── confirmations.ts              # Pull and prune texts, shared by every list that pulls
│   │   ├── components/
│   │   │   ├── ManagedImages.tsx         # Repository → Tag → Digest tree view
│   │   │   ├── ImageRepositoryList.tsx   # Repository-level rows
│   │   │   ├── ImageList.tsx             # Per-tag rows
│   │   │   ├── ImageContainerList.tsx    # Containers using a tag
│   │   │   ├── ImageOverview.tsx         # Detail view with stats and tables
│   │   │   └── UpdateIcon.tsx            # Animated update-check indicator
│   │   ├── hooks/
│   │   │   ├── useImagesData.ts          # Builds the image tree from docker states
│   │   │   └── useImageNodeActions.ts    # Check and pull for a node -- list rows and page alike
│   │   └── lib/
│   │       ├── digest.ts                 # Digest and image-id normalisation, "is a check running"
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
│   │   │   └── ProjectClients.tsx        # Clients tab: host → its containers, with updates
│   │   └── hooks/
│   │       └── useProjectMembers.ts      # Host states, container → project assignment, members, targets
│   ├── activity/                         # What happened, as structured events
│   │   ├── confirmations.ts              # Delete-all text
│   │   ├── components/
│   │   │   ├── ActivityGroupSteps.tsx    # The members of one correlated group
│   │   │   └── ActivityView.tsx          # The page, still reached as "Notifications"
│   │   └── lib/
│   │       ├── activityText.ts           # kind + data -> the sentence a reader sees
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
│   │       └── SettingsParts.tsx         # Section header, field captions and the other shared pieces
│   └── tokens/                           # Registration token management
│       ├── confirmations.ts              # Delete-token text
│       └── components/
│           ├── TokenOverview.tsx
│           ├── TokenList.tsx
│           └── TokenModal.tsx
├── components/
│   ├── LoadingIndicator.tsx              # "Something is on its way", for a view with nothing yet
│   ├── NotFoundCard.tsx                  # A page whose subject does not exist, with the way back
│   ├── listDefaults.ts                   # Page size (20 own page, 10 inside a tab) and pagination
│   └── menuEntry.ts                      # Class of a detail page's action-menu entry
├── hooks/
│   ├── useSearchQueryParam.ts            # Search box and active tab, held in the URL
│   ├── useNow.ts                         # One shared clock for durations that keep counting
│   ├── useEscapeToLeave.ts               # Escape on a detail page leads back, unless a field has focus
│   └── useDockerClientLookup.ts          # Container/image → the client it lives on
├── lib/
│   └── apiFetch.ts                       # fetch for authenticated endpoints, central 401 handling
├── pages/                                # Route entry points
│   ├── Login.tsx                         # Authentication page (Local & OIDC)
│   └── Settings.tsx                      # System settings page
├── stores/                               # Global state management (Zustand)
│   ├── useClientStore.ts                 # Registered clients and online/offline status
│   ├── useDockerStore.ts                 # Per-client Docker states, actions and update checks
│   ├── useActivityStore.ts               # The activity list and the per-user seen state
│   ├── useProjectStore.ts                # Managed projects and the discovered names
│   ├── useAutoUpdateStore.ts             # The configured auto-update label
│   ├── useSchedulerStore.ts              # Status of the server's schedulers
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
| `/clients/new`      | `AppLayout`     | The `AddClientWizard`.                                              |
| `/client/:clientId` | `AppLayout`     | Detail view of a specific client (containers/images/volumes/nets).  |
| `/client/:clientId/edit` | `AppLayout` | The `ClientEditor` for that client.                               |
| `/containers`       | `AppLayout`     | Aggregated containers across all clients.                           |
| `/container/:containerId` | `AppLayout` | One container (name + image) and its instances on every client. |
| `/images`           | `AppLayout`     | Aggregated images as a Repository → Tag → Digest tree.              |
| `/image/:imageId`   | `AppLayout`     | Image detail view (stats, containers using it).                     |
| `/projects`         | `AppLayout`     | Managed projects across all clients.                                |
| `/projects/new`     | `AppLayout`     | Add a project: name, query, auto-update and schedule.               |
| `/project/:projectId` | `AppLayout`   | One project: its query, settings and members.                       |
| `/project/:projectId/edit` | `AppLayout` | Edit a project in the same editor.                              |
| `/notifications`    | `AppLayout`     | The activity list. The path and the menu entry keep the old name.   |
| `/users`            | `AppLayout`     | User management.                                                    |
| `/tokens`           | `AppLayout`     | Registration token management.                                      |
| `/settings`         | `AppLayout`     | System settings (retention policies, image cache, etc.).            |

All routes except `/login` are wrapped in a `ProtectedRoute` component that redirects unauthenticated users to `/login`.

The `AppLayout` uses the `Dashboard` component from `@stefgo/react-ui-components`. Since library 3.0 it renders **only the navigation** and highlights the entry whose `path` matches; the page content is a `<Routes>` element passed to it as `children`. A `DashboardPage` entry is therefore `{ id, path, nav }` — path (with `:param` segments), plus label, icon and an optional badge. Navigation is organised into `navGroups` (`resources`, `notification`, `admin`).

A path no entry claims reaches the catch-all route and renders a **404 card** that names the path and leads back to the clients view. The Dashboard used to fall back to its first page silently, so an unknown URL looked like the clients page.

**The pages are loaded on demand** (`React.lazy` with a `Suspense` fallback), so a chunk arrives with the route that needs it. The previous shape passed every page as an element to the Dashboard, which built the tree of all nine on every render of the shell even though one was on screen.

Each route takes what it needs from the stores itself: `ClientsRoute` and `ClientDetailRoute` read `useClientStore`, `ImageDetailRoute` and `ContainerDetailRoute` read their `:imageId` / `:containerId` parameter. A client id that is not in the store yet renders the list rather than redirecting, because a link to a client arrives before the client list does.

---

## 🔐 Authentication

Authentication is managed by the `AuthProvider` (`src/features/auth/AuthProvider.tsx`); components read it through `useAuth` from `AuthContext.ts`.

Each context is split the same way: the context object and its hook live in a JSX-free `.ts` module, the provider component in a `.tsx` file of its own. A module that exports a component next to a hook cannot be swapped by Vite's Fast Refresh, and `react-refresh/only-export-components` reports it as an error.

- **Session**: The JWT never reaches JavaScript. The server keeps it in the httpOnly cookie `dim_session`, which the browser sends with every request and with the WebSocket handshake. The page only reads the flag cookie `dim_auth`, which carries no secret, to decide whether to render the login form.
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
- **`useActivityStore`**: The activity list (`ActivityRecord[]`) as the server reads it for the session's user, so `seen` needs no user id on this side. Fed by `ACTIVITY_UPDATE`, `ACTIVITY_APPENDED`, `ACTIVITY_SEEN` (`applySeen`) and by `fetchEvents` on connect; `unseenTone` gives the badge its colour as a string, so the shell re-renders only when that changes; `markManySeen` and `clearAll` update optimistically and then call the API.
- **`useProjectStore`**: The managed projects (`ProjectSummary[]`) and `discovered` — the Compose project names the hosts report that have no DIM entry yet. `createProject`, `updateProject` and `deleteProject` do not touch the store: the server broadcasts `PROJECTS_UPDATE` after every change, and that is the one path the list is updated through. Errors are thrown rather than swallowed, because every caller has a dialog to show them in.
- **`useSchedulerStore`**: `schedulers`, the status of each scheduler the server runs (`image-update-check`, `image-cache-cleanup`, `notification-cleanup`, `token-cleanup`). Filled by `setSchedulers` from `GET /api/v1/settings/scheduler-status` and kept current by `applyUpdate` from `SCHEDULER_STATUS_UPDATE`, one scheduler at a time.
- **`useAutoUpdateStore`**: The configured auto-update label, and nothing else. Nothing is enrolled from here — the container lists read the label to show which containers carry it.
- **`useUIStore`**: Manages global UI state — currently sidebar collapse state. Uses Zustand's `persist` middleware to save state to `localStorage` (`dim-ui-storage`).

### Real-time Updates (WebSocket)

The `WebSocketProvider` (`src/features/app/context/WebSocketProvider.tsx`) maintains a persistent WebSocket connection to the backend (`ws://.../ws/dashboard`), authenticated by the session cookie the browser sends with the handshake. Incoming messages are dispatched to the stores:

| Event                  | Handler                                          |
| :--------------------- | :----------------------------------------------- |
| `CLIENTS_UPDATE`       | `useClientStore.setClients`                      |
| `DOCKER_STATE_UPDATE`  | `useDockerStore.setDockerState(clientId, state)` |
| `DOCKER_ACTION_RESULT` | Consumed by action promises in `useDockerStore`  |
| `SCHEDULER_STATUS_UPDATE` | `useSchedulerStore.applyUpdate` |
| `AUTO_UPDATE_LABEL_UPDATE` | `useAutoUpdateStore.setLabelFilter`               |
| `PROJECTS_UPDATE`      | `useProjectStore.setProjects`                    |
| `ACTIVITY_UPDATE`      | `useActivityStore` — replaces the activity list  |
| `ACTIVITY_APPENDED`    | `useActivityStore.appendEvents` — merges new events by id, newest first |
| `ACTIVITY_SEEN`        | `useActivityStore.applySeen` — marks the ids seen, also from another tab |

On connect the server sends `CLIENTS_UPDATE`, every stored Docker state and the activity list by itself, so the first screen fills without a REST call.

---

## 🧩 Feature Details

### ManagedClients (`features/clients`)

The container component for the client management view. Coordinates between the client list, the editor and the add-client wizard.

- **Functionality**:
    - Displays the list of registered clients (`ClientList`).
    - Opens the client editor (`ClientEditor`) for renaming a client, for inbound clients editing or switching off the address its connections must come from, and for outbound clients the address the server dials. `Escape` leaves the editor and discards, as the Cancel button beside it does; while anything has been changed the footer says so, which is the safety net for both. The field is validated with `Ipv4OrCidrSchema` from `@dim/shared`, the same rule the server applies; server errors are shown in the form. An allowed address that would not let `inboundLastIp` — the address of the agent's last successful connect — back in is called out beneath the field, using the same `isIpAllowed` the server decides with. It does not block saving: the value is well-formed and the agent may have moved on purpose, so this is a consequence worth seeing, not a reason to refuse. The editor also carries this host's auto-update schedule: a box for "give this host its own", and the expression under it. The box off means the default from the settings applies; on with an empty expression means the host auto-updates only what belongs to a project. Saving reaches the agent at once — it runs that schedule itself, from the policy the server sends it.
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

### Confirmations

Every question before an action, and every notice after a failed one, goes through `useConfirm()` from the library. `ConfirmProvider` sits next to `ToastProvider` in `App.tsx` and renders the one dialog that answers; no component keeps a pending request, a busy flag or a `ConfirmDialog` of its own, and no component calls `window.alert` or `window.confirm`.

- `confirm(options)` resolves `true` or `false`. An action that is quick to hand off — a pull, a discard — runs after the `await`.
- An action whose outcome is worth waiting for — a delete, a remove, a prune — goes in `onConfirm`. The dialog stays open and busy until it settles; a rejection keeps it open with the error inside it, next to the button that retries. That is why `ClientOverview.sendAction` throws rather than reporting the failure itself.
- `alert(describeFailure(title, error))` from `utils.ts` reports a failure of an action that was not asked about first, such as the cleanups in Settings.

**The texts live in a `confirmations.ts` per feature** (`activity`, `clients`, `containers`, `images`, `projects`, `tokens`, `users`), one `describeX(...)` per action, returning the complete options including `variant`. A component decides *that* it asks, never *what* the question says or whether it is `danger`. The reasoning behind a wording — what the agent really does, what stays on the host — is kept as a comment on its function.

### AddClientWizard (`features/clients/components/add-client`)

One flow for both connection modes, built on `Wizard` from `@stefgo/react-ui-components`. Step 1 is the decision about which side opens the connection; step 2 is the branch that follows from it. As two separate entry points this was a decision the operator had to have made before reaching a form.

It lives in the workspace rather than in a modal, because the two branches end in different things: a token to carry to another machine, or a connection attempt that may fail with a reason worth reading.

- **Inbound branch**: display name and allowed address for the client the token will create. Both optional — without them the agent's hostname names the client and the address it registers from becomes its allowed address. Ends in a `TokenModal`, which shows the token once.
- **Outbound branch**: hostname, target address and the agent's setup PIN (or its `DIM_REGISTRATION_SECRET`); finishing dials the agent straight away, and a refusal is shown on the step with the agent's own reason.
- The wizard renders only the current step, so the form state lives above it in `useAddClientForm` — a step holding its inputs in its own `useState` would lose them on Back.
- Both fields that the server validates are checked in the form with the same functions the endpoints use (`Ipv4OrCidrSchema`, `normaliseTargetAddress` from `@dim/shared`).
- `Escape` leaves the wizard. The listener sits on `window`, one level further out than menus and dialogs that listen on `document` and stop the event there, so an open select closes itself without taking the wizard with it. It is off while the token is on screen: that dialog is acknowledged by button, because the token is shown exactly once.

### ClientOverview (`features/clients`)

The detail view for a single client, shown when navigating to `/client/:clientId`. Uses `Card` and `ActionMenu` from `@stefgo/react-ui-components` and renders four tabs backed by the client's entry in `useDockerStore`:

- `ClientContainerList` — containers, with start/stop/restart/remove/recreate actions.
- `ClientImageList` — images, with pull/update/remove and prune.
- `ClientVolumeList` — volumes, with remove.
- `ClientNetworkList` — networks, with remove.

An offline client shows the header alone, without the cards and tabs: its last Docker state would read as current, and its actions would go to a host that cannot answer. The header still names the time of that state and when the client was last seen.

Every tab hands its actions to `ClientOverview.handleAction`. Remove actions (container, image, volume, network) stop there and ask through `useConfirm()` with `describeRemove`, naming the entry and the consequence: a container is removed with force, even while running; image, volume and network are removed without force, so Docker refuses them while in use. All other actions are sent at once.

### ManagedContainers (`features/containers`)

Aggregates containers from every connected client into a tree (client → containers). Supports search, pagination, a state-based status dot, per-row container actions, and a "Check All" action that runs image update checks for every distinct image in view. Remove asks first; on a container row it removes every instance of that name, and the dialog says on how many clients.

A click on a row opens `/container/:containerId`; a client row opens the page of the container it belongs to. The id is the group key of `useContainersData` (`name||configImage`), URL-encoded. The actions of a row live in `useContainerActions`, which the list and the page share, so both ask the same questions.

### ContainerOverview (`features/containers`)

The detail view for one container across the fleet. An `EntityHeader` names it, shows its aggregate state and update status as badges, and keeps the configured image, the running count, the auto-update reading and the last registry check behind its details toggle; its menu acts on every instance at once. **Last Checked** and **Check Result** are what the update badge cannot say: the badge reads an error as "unchecked" and falls silent, so the two rows carry the newest timestamp of the hosts' answers and, where one failed, the registry's reason (`Registry rate limit reached (429)`), with a count where only some hosts failed. `summarizeChecks` (`features/images/lib/checkSummary.ts`) works these out; `ImageOverview` shows the same two rows from the same function. Below it a table lists the instances, one per client, with their state, image, auto-update reading and per-instance actions.

**An offline host's containers are not read as current.** The server keeps the last snapshot a host reported, and a host that went away -- or an agent that stopped its own container -- leaves that snapshot saying `running`. So an instance on a disconnected client shows a hollow dot and "Unknown (client offline)", the group's state is read from the instances on connected hosts only (`unknown` when there are none), and every action skips the offline instances: start, stop, remove and pull are disabled where nothing is left to reach. The container list follows the same reading.

**A container's uptime keeps counting.** Docker's status text ("Up 4 hours") would be frozen when the agent took its state, and the agent sends a new state only when something happens on the host, so the agent does not send it at all. Every list shows `ContainerStatus` (`features/containers/components`), which derives the text from `state`, `health`, `startedAt`, `finishedAt` and `exitCode` by the rules of `docker ps` (`containerStatus` in `containerState.ts`, `humanDuration` in `utils.ts`) and re-renders on the tick of `hooks/useNow` -- one interval of 30 s for the whole page. Where the timestamps are missing, from an older agent or a stored state, the text goes without its duration ("Up", "Exited (0)"). A search over the status matches the text as shown.

The list that opened the page passes `from` in the router state -- the containers list may sit in a project's tab -- and `Escape`, like a removed container, leads back there; a URL opened directly leads back to `/containers`. An id that matches no container says so on the page instead of redirecting.

### ManagedProjects & ProjectOverview (`features/projects`)

A project is a group of containers across the whole fleet, defined by a query over clients,
containers and images (see [Projects](api.md#-projects) in the API reference). A container belongs to one project at most.

- **`ManagedProjects`**: every project with its auto-update setting, its schedule, how many
  containers it currently has, and an **Update** column drawing the same icon the image lists
  use, from the worst status among the images the project runs. The row acts on it as well:
  Check asks the registry about every image of the project, Pull & Recreate pulls only those a
  check found an update for, on the hosts that run them; the header's Check does the same
  across every project, asking once per reference rather than once per project. Edit and
  Delete sit in the row menu; the delete dialog says that only the DIM entry goes and no
  container is touched. There is no Clients column — the project page answers that.
- **`ProjectEditor`**: one page for `/projects/new` and `/project/:projectId/edit`, laid out
  like the add-client flow (`Escape` leaves, back goes to `location.state.from`). Name, query,
  auto-update and schedule, and below them the **result table**, recomputed on every keystroke
  from the Docker states in the store: every matching container with its client, Compose
  project, image, the numbers of the criteria that match it, and the project it already
  belongs to, if any. Saving is blocked while there are such conflicts, while a criterion has
  no value and while the name is taken; the server checks the same again. Discovered Compose
  projects are offered as one-click criteria.
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
- **`useProjectMembers`**: `useHostStates`, `useProjectAssignment` (container → project, via
  `resolveAssignment` from `@dim/shared`, the function the server and the agents use too) and
  `useAllProjectMembers`. Everything is derived from the Docker states the store already
  holds, so a container that starts or stops matching moves without anything being fetched.
  `ProjectMembers.targets` carries one entry per image reference — the digests a check is
  keyed by, the hosts a pull has to reach, and how far behind it is; `imageCount` and the
  project's update status are derived from it, and it is what the list's row actions act on.

### ManagedImages & ImageOverview (`features/images`)

`ManagedImages` renders a three-level tree: Repository → Tag → Digest, with per-node actions (Check Update, Pull & Recreate, Remove, Prune). Update status animations are driven by `useDockerStore.checkingImages` and `imageUpdateStatus`, scoped per digest. Filtering via the search bar traverses the full tree so matches deep in a tag/digest still surface. Both prune actions (per row and the toolbar button) ask first and name how many images go.

`ImageOverview` is the dedicated detail page (`/image/:imageId`) with `StatCard`s and two `DataMultiView` tables: one for the image's tags/digests and one for the containers that use them. Its Prune button asks first as well.

The page is built like the client and container pages. Its header carries the details (repository, tag, digest, hosts, size, last check — and, for an image with an update, what the registry's OCI labels say about the new image: title, version, revision, build date and source, each only where the image sets it) and an action menu with **Check for Update** and **Pull** (or **Pull & Recreate**). Prune stays with the list below: it acts on the images listed there. Check and pull come from `useImageNodeActions`, which the image list's row actions use too, so a row and its page cannot disagree about what is possible. The open tab is kept in the URL. The list passes `from` in the router state, and `Escape` leads back there, search included.

`Escape` on a detail page — client, container, image, project — is handled by `hooks/useEscapeToLeave`. It does nothing while the focus is in a field, so Escape in a list's search box clears nothing and leaves nothing.

### ActivityView (`features/activity`)

The page at `/notifications` — the menu entry keeps the name, what it shows does not. Its
entries are structured events: a `kind`, a `level`, what the event is about and the facts of
that kind.

**The text is written here.** `activityText.ts` is the one place a wording exists: an agent
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
by its earliest member, so no event can go missing.

**The level filter is a minimum.** It sits at the right end of the search bar (`searchActions`)
and opens on what needs a look: `error` while an error is unseen, else `warning` while a
warning is, else `info` — the same rule as the sidebar badge. The start is fixed once the list
is known, so marking rows seen does not move the filter. `trace` events — agents connecting
and disconnecting — are hidden until `trace` is chosen.

**A second filter hides what has been seen.** Next to the level filter, `all` / `unseen`
switches between the whole list and the rows with something unseen in them; under `unseen` a
row leaves the list once it is marked seen. It starts at `all`.

**"Mark as seen" follows the filter.** It marks the unseen events of every row the level
filter and the search leave, across all pages, and nothing the reader has not been shown.

**Entries are not deleted one by one.** A row can be marked seen; the history goes as a whole
("Delete all") or through retention. The sidebar badge does not
count them either. An event that names a host but carries no `clientName` (recorded before
the server stored it) gets the name from `useClientStore` by `clientId`.

Everything else is found through the search box, as on the other lists (`useSearchQueryParam`,
so the query survives a reload). It matches the sentence a row shows, its detail line, the
`kind`, and the host, container, image and project the event is about. A group matches when
any of its events does, so a step is found under the operation it belongs to. The sidebar
badge counts single unseen events, not groups.

### UserOverview (`features/users`)

Manages user accounts. Supports creating, editing, and deleting users via a `UserDialog` form. Deleting asks first; the dialog states that a session the account already holds stays valid until it expires, because the API checks only the JWT. For the last remaining user a second dialog explains why it cannot be deleted instead of sending the request. `UserList` is a `DataMultiView` like every other list: search by username, a list view for narrow screens, pagination.

### TokenOverview (`features/tokens`)

Lists registration tokens via `TokenList` — a `DataMultiView` with search over token hash, display name and address — and deletes them after asking. Tokens are **issued in the `AddClientWizard`**, not here: that is where the two defaults a token carries — display name and allowed address — are entered, and a second entry point would only produce tokens without them. The list shows a token by the first 12 characters of its SHA-256 hash (the full hash in the tooltip), since the server keeps nothing else; the token itself is shown once, in the wizard's `TokenModal`. It shows both defaults per token, or "From the agent" for a token that carries neither.

### Settings (`pages/Settings.tsx`, `features/settings`)

System settings page, one section per tab: Client Tokens, Image Version Cache, Image Update Check, Container Auto-Update and Notification History. The tabs are the library's `useTabs`/`TabList`/`TabPanel`, and the open one is kept in the URL (`?tab=`). The sections live in `features/settings/components`; `features/settings/sections.ts` names the keys each one edits.

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
- `GET /api/v1/settings/container-auto-update/label` — The configured auto-update label on its own, read by `useAutoUpdateStore` and kept in sync via `AUTO_UPDATE_LABEL_UPDATE`.

**Every tab with a scheduler follows one layout:** its settings, then one `SchedulerBox` headed "Scheduler". It shows Status (`Running…` or `Idle`), Last Run (with "manual" when a user started it), Next Run (or "Disabled") and Result, and, below a divider, the `ManualRun` row with its Run Now button. The box draws no field borders: its values are to read, not to edit. It reads `useSchedulerStore`; the result is worded by `describeRunResult` (`features/settings/lib/runResult.ts`), in red for a failed or interrupted run and in amber for one a rate limit cut short. Client Tokens, Image Version Cache, Image Update Check and Notification History have one; Container Auto-Update has none, because the server runs no auto-update.

The Image Update Check tab lists the registries above its scheduler box (`RegistryStatusTable`, fed from `useSchedulerStore().schedulers["image-update-check"].registries`): one row per registry host with its image count, a status badge (`Ok`, `Paused`, `Error`), the last check, the next attempt while paused, the requests the registry says remain (only where it sends `ratelimit-remaining`) and the error. Docker Hub's `registry-1.docker.io` is shown as "Docker Hub" (`registryLabel` in `@dim/shared`). The scheduler box says whether the check runs; the table says why the images of one registry get no fresh answers.

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
newest `autoupdate.run` event per client — out of the activity store, so a run that reports
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

**The data views own sorting and paging.** A view receives the complete set in `data` and takes the page *after* sorting, which is what makes a column sort cover every row instead of the ten on screen. The page state lives in the view, configured through `pagination(PAGE_SIZE.…)` from `components/listDefaults.ts` — 20 rows for a list that is a page of its own, 10 for one inside a tab; `usePagination` is only for holding it outside, and the app does not need it. Sorting, search and view mode follow the same shape: `sort={{ defaultValue: [...] }}`, `search={{ value, onChange }}`, `viewMode={{ persist: { key, scope: "local" } }}` — the persistence vocabulary that replaced the bare `storageKey` in library 4.0; `scope: "local"` is what `storageKey` did, so a chosen view mode survived the move.

**The tabs are the library's.** The tabbed detail pages — `ClientOverview`, `ImageOverview`, `ProjectOverview` — drive their `StatCard` headers and the panels below from one `useTabs({ tabs, value, onChange })`: it supplies the roles, the tab-to-panel wiring, the roving tabindex and the arrow keys, and the cards take their semantics from its `tabProps` rather than claiming to be toggles. `TabPanel` keeps the behaviour the app's own former `TabPanel` existed for, now under the name `visited`: a panel that has been opened once stays mounted, so a tab's search, sort and page survive a switch away and back. The active tab itself is a URL parameter, so a reload and a shared link land on the same tab.
