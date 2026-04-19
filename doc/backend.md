# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Docker Instance Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a layered architecture: **Routes → Controllers → Services → Repositories**.

```
server/backend/src/
├── config/
│   └── AppConfig.ts                       # Configuration management (JWT, OIDC, settings, security)
├── controllers/                           # HTTP and WebSocket request handlers
│   ├── AuthController.ts
│   ├── ClientController.ts
│   ├── ContainerAutoUpdateController.ts   # Manual container auto-update enrollment (batch CRUD)
│   ├── DockerController.ts                # Docker state, actions, image update checks
│   ├── SettingsController.ts
│   ├── TokenController.ts
│   ├── UserController.ts
│   └── WebSocketController.ts
├── core/                                  # Core infrastructure
│   ├── Database.ts                        # SQLite initialization & migration runner
│   ├── logger.ts                          # Pino logger configuration
│   └── migrations/
│       ├── 00_initial.ts                  # Initial database schema
│       ├── 01_docker_state.ts             # docker_state table
│       ├── 02_image_update_checks.ts      # image_update_checks table
│       ├── 03_image_update_checks_drop_columns.ts
│       └── 04_container_auto_update.ts    # container_auto_update_manual table
├── repositories/                          # Database access layer
│   ├── ClientRepository.ts
│   ├── DockerStateRepository.ts           # docker_state + image_update_checks access
│   ├── ContainerAutoUpdateRepository.ts   # container_auto_update_manual access
│   ├── TokenRepository.ts
│   └── UserRepository.ts
├── routes/
│   └── api.ts                             # Fastify route registration (all endpoints)
├── services/                              # Business logic
│   ├── AuthService.ts                     # Authentication, OIDC flow, JWT
│   ├── DockerStateService.ts              # Persist/retrieve Docker state snapshots
│   ├── ImageUpdateService.ts              # Registry manifest checks (Docker Hub, ghcr.io, lscr.io)
│   ├── ImageUpdateCacheCleanupService.ts  # Scheduled image_update_checks cleanup
│   ├── ImageUpdateCheckSchedulerService.ts # Periodic registry update sweep
│   ├── ContainerAutoUpdateSchedulerService.ts # Cron-driven container auto-update sweep
│   ├── ProxyService.ts                    # WebSocket connection management & broadcasting
│   ├── SettingsService.ts                 # Settings retrieval, update & persistence
│   └── TokenCleanupService.ts             # Retention cleanup for invalid registration tokens
├── utils/
│   └── networkUtils.ts                    # CIDR/IPv4 network validation helpers
└── index.ts                               # Fastify server setup & entry point
```

---

## 🏗️ Core Components

### 1. Routes (`src/routes/api.ts`)

All routes are registered as a single Fastify plugin under the `/api` prefix. Protected routes apply `request.jwtVerify()` middleware.

**Public routes:**
- `POST /api/login` — Local authentication
- `GET /api/auth/config` — Auth type configuration
- `GET /api/auth/login` — OIDC redirect
- `GET /api/auth/callback` — OIDC callback
- `POST /api/v1/register` — Client self-registration
- `GET /api/v1/ping` — Health check

**Protected routes (JWT required):**
- Users: `GET/POST /api/v1/users`, `PUT/DELETE /api/v1/users/:userId`
- Clients: `GET /api/v1/clients`, `PUT/DELETE /api/v1/clients/:clientId`
- Tokens: `GET/POST /api/v1/tokens`, `DELETE /api/v1/tokens/:token`
- Docker: `GET /api/v1/clients/:clientId/docker`, `POST /api/v1/clients/:clientId/docker/action`, `POST /api/v1/clients/:clientId/docker/refresh`, `GET /api/v1/docker/images/check-update`
- Settings: `GET/PUT /api/v1/settings/cleanup`, `POST /api/v1/settings/cleanup/invalid-tokens`, `POST /api/v1/settings/cleanup/image-version-cache`

**WebSocket routes:**
- `GET /ws/dashboard` — Dashboard real-time feed (JWT via query param)
- `GET /ws/agent` — Client agent connection (authToken via query param)

### 2. Controllers (`src/controllers/`)

Controllers parse HTTP/WebSocket input, delegate to services, and format responses.

| Controller              | Responsibilities                                                              |
| :---------------------- | :---------------------------------------------------------------------------- |
| `AuthController`        | Local login, OIDC redirect & callback, PKCE flow management.                 |
| `UserController`        | User CRUD — enforces self-deletion prevention and minimum user count.         |
| `ClientController`      | Client list (with live status), display name updates, deletion.               |
| `TokenController`       | Registration token generation, listing, deletion, and client self-registration. |
| `DockerController`      | Docker state retrieval, action dispatch to agents, image update checks.       |
| `SettingsController`    | Retrieve/update retention & image-cache settings, trigger manual cleanups.    |
| `WebSocketController`   | Dashboard and agent WebSocket lifecycle (auth, heartbeat, message routing).   |

### 3. Services (`src/services/`)

Services contain the business logic shared across controllers.

#### `AuthService`
- `initializeAdmin()` — Creates a default `admin` user (password: `"admin"`) if the database is empty on first startup.
- `checkLocalAuth(username, password)` — Validates credentials against bcrypt-hashed passwords.
- `getAuthConfig()` — Returns local/OIDC configuration for the frontend.
- `generateOidcUrl()` — Builds the OIDC authorization URL with PKCE code challenge and state.
- `handleOidcCallback(currentUrl)` — Validates state, exchanges code for tokens, fetches userinfo.

#### `ProxyService`
The central hub for all real-time communication.

- **Agent tracking**: `registerClient` / `unregisterClient` — manages the map of connected agent WebSockets.
- **Dashboard tracking**: `addDashboardClient` / `removeDashboardClient` — manages all active dashboard sessions.
- **Status enrichment**: `getClientsWithStatus()` — augments database records with live online/offline status.
- **Broadcasting**: `broadcastClientUpdate()` sends `CLIENTS_UPDATE` to all dashboards; `broadcastToDashboard()` multicasts arbitrary messages.
- **RPC**: `sendRequest<K>(clientId, type, payload)` — typed async request/response to an agent with a 5-second timeout.
- **Fire-and-forget**: `sendFireAndForget(clientId, type, payload)` — one-way message to an agent.
- **Docker state**: `handleDockerUpdate(clientId, state)` persists the snapshot via `DockerStateService` and rebroadcasts it as `DOCKER_STATE_UPDATE` to all dashboards.
- **Docker actions**: `sendDockerAction(clientId, action)` forwards a `DOCKER_ACTION`; `waitForActionResult(actionId, timeoutMs = 120_000)` returns a promise resolved by `handleDockerActionResult()` when the agent answers. The result is also rebroadcast to dashboards.

#### `DockerStateService`
- `update(clientId, state)` — Upserts the snapshot in the `docker_state` table and returns the stored `DockerState` (with `updatedAt`).
- `getByClientId(clientId)` — Returns the last persisted state, or `null`.

#### `ImageUpdateService`
- `checkForUpdate(repoTag, repoDigests)` — Parses the image reference, authenticates against the registry (Docker Hub, `ghcr.io`, `lscr.io`), fetches the manifest digest via a `HEAD /v2/{name}/manifests/{tag}` request and compares it against the supplied local digest. Returns `{ repoTag, localDigest, remoteDigest, hasUpdate, error? }`. The result is cached in the `image_update_checks` table by the `DockerController`.

#### `ImageUpdateCacheCleanupService`
- `run()` — Removes orphaned `image_update_checks` rows (rows whose `image_ref` is no longer referenced by any client state) and rows older than `image_version_cache_ttl_days`. Returns `{ orphansRemoved, expiredRemoved }`.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Runs `run()` every `image_version_cache_cleanup_interval_hours`. `0` disables the scheduler. Automatically restarted when any `image_version_cache_*` setting changes.

#### `ImageUpdateCheckSchedulerService`
- `run()` — Sweeps every known image ref, calls `ImageUpdateService.checkForUpdate`, and persists the result. Broadcasts `SCHEDULER_STATUS_UPDATE` (key `imageUpdateCheck`) while running.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Interval driven by `image_update_check_interval_seconds`. `0` disables.

#### `ContainerAutoUpdateSchedulerService`
- `run()` — Collects all eligible containers (label-matched ∪ manually enrolled from `container_auto_update_manual`), deduplicates by image ref, optionally re-checks each image against its registry (`container_auto_update_refresh_check`), then dispatches an `image:update` action per container where `hasUpdate === true`. Returns `{ eligible, updated, skippedNoUpdate, skippedOffline, failed }`.
- `getEligibleContainers()` — Returns the combined set with a `source` flag (`"label"` vs `"manual"`). Labels take precedence when a container matches both.
- `validateCron(expr)` — Validates a cron expression via `node-cron`.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Uses `node-cron` with `container_auto_update_cron`. Empty or invalid expressions disable the scheduler. Automatically restarted when the cron setting changes. Broadcasts status via `SCHEDULER_STATUS_UPDATE` (key `containerAutoUpdate`).

#### `TokenCleanupService`
- `run()` — Removes used/expired registration tokens older than `retention_invalid_tokens_days` while keeping at least `retention_invalid_tokens_count` of the most-recent invalid tokens.

#### `SettingsService`
- `getAllSettings()` — Returns all settings keys and the security configuration.
- `getSetting(key)` / `updateSetting(key, value)` — Get or update a single setting.
- `updateSettings(settings, security)` — Batch update settings and/or security networks, persisted to `config.yaml`.

### 4. Repositories (`src/repositories/`)

Repositories encapsulate all database queries using `better-sqlite3` (synchronous).

| Repository               | Tables accessed                          | Key operations                                                   |
| :----------------------- | :--------------------------------------- | :--------------------------------------------------------------- |
| `ClientRepository`       | `clients`                                | CRUD, lookup by authToken, update last_seen/version.             |
| `TokenRepository`        | `registration_tokens`                    | Create with expiry, mark as used, delete, retention cleanup.     |
| `UserRepository`         | `users`                                  | CRUD, lookup by username, password hash management.              |
| `DockerStateRepository`  | `docker_state`, `image_update_checks`    | Upsert/query Docker snapshots; cache and clean up image checks.  |
| `ContainerAutoUpdateRepository` | `container_auto_update_manual`    | Manual enrollments for the container auto-update scheduler.     |

### 5. WebSocket Controller (`src/controllers/WebSocketController.ts`)

**Dashboard WebSocket (`/ws/dashboard`):**
- Verifies JWT from query parameter.
- Sends the current client list immediately on connect.
- Runs a 30-second ping/pong heartbeat.
- Registered in `ProxyService` to receive all broadcasts.

**Agent WebSocket (`/ws/agent`):**
- 4-step authentication: token lookup → global IP whitelist → per-client IP check → 5-second AUTH handshake.
- On success: updates `last_seen`, `ip_address`, `version` in the database; registers in `ProxyService`; broadcasts `CLIENTS_UPDATE` to all dashboards; immediately replays the last cached `docker_state` to dashboards so reconnecting clients show up quickly.
- Incoming `DOCKER_UPDATE` → `ProxyService.handleDockerUpdate()` (persist + rebroadcast).
- Incoming `DOCKER_ACTION_RESULT` → `ProxyService.handleDockerActionResult()` (resolve pending promise + rebroadcast).
- On disconnect: unregisters from `ProxyService`; broadcasts updated client list.

---

## 🗄️ Database Management

The backend uses **SQLite3** via `better-sqlite3` (synchronous API) for fast, embedded storage.

- **Location**: `server/data/server.db` (created automatically on first run).
- **WAL mode**: Enabled for improved read/write concurrency.
- **Migrations**: Managed by `umzug`. All pending migrations are applied automatically on startup.

### Schema

**`clients`**

| Column        | Type     | Description                                              |
| :------------ | :------- | :------------------------------------------------------- |
| `id`          | TEXT PK  | Client UUID (generated by the agent).                    |
| `hostname`    | TEXT     | Client hostname.                                         |
| `display_name`| TEXT     | Optional human-readable name.                            |
| `auth_token`  | TEXT     | Permanent token for WebSocket authentication (unique).   |
| `allowed_ip`  | TEXT     | IP address used during registration.                     |
| `ip_address`  | TEXT     | Most recently seen IP address.                           |
| `version`     | TEXT     | Agent version reported on last connection.               |
| `last_seen`   | DATETIME | Timestamp of last successful connection.                 |
| `created_at`  | DATETIME | Creation timestamp.                                      |
| `updated_at`  | DATETIME | Last update timestamp.                                   |

**`users`**

| Column          | Type        | Description                                          |
| :-------------- | :---------- | :--------------------------------------------------- |
| `id`            | INTEGER PK  | Auto-incremented user ID.                            |
| `username`      | TEXT UNIQUE | Unique username.                                     |
| `password_hash` | TEXT        | bcrypt-hashed password (null for OIDC-only users).   |
| `auth_methods`  | TEXT        | Comma-separated: `"local"`, `"oidc"`, or both.       |
| `created_at`    | DATETIME    | Creation timestamp.                                  |
| `updated_at`    | DATETIME    | Last update timestamp.                               |

**`registration_tokens`**

| Column       | Type     | Description                                              |
| :----------- | :------- | :------------------------------------------------------- |
| `token`      | TEXT PK  | Random 32-character hex string.                          |
| `created_at` | DATETIME | Creation timestamp.                                      |
| `expires_at` | DATETIME | Expiry timestamp (30 minutes after creation).            |
| `used_at`    | DATETIME | Timestamp when a client registered with this token.      |

**`docker_state`** _(migration 01)_

| Column       | Type     | Description                                                              |
| :----------- | :------- | :----------------------------------------------------------------------- |
| `client_id`  | TEXT PK  | FK → `clients(id)`, cascades on delete.                                  |
| `containers` | TEXT     | JSON-encoded `DockerContainer[]`.                                        |
| `images`     | TEXT     | JSON-encoded `DockerImage[]`.                                            |
| `volumes`    | TEXT     | JSON-encoded `DockerVolume[]`.                                           |
| `networks`   | TEXT     | JSON-encoded `DockerNetwork[]`.                                          |
| `updated_at` | DATETIME | Timestamp of the most recent snapshot.                                   |

**`image_update_checks`** _(migrations 02 / 03)_

| Column          | Type    | Description                                                                                |
| :-------------- | :------ | :----------------------------------------------------------------------------------------- |
| `image_ref`     | TEXT PK | Image reference (e.g. `nginx:latest`).                                                     |
| `remote_digest` | TEXT    | Manifest digest fetched from the registry.                                                 |
| `checked_at`    | TEXT    | ISO 8601 timestamp of the last check. Used by the cache TTL cleanup.                       |
| `error`         | TEXT    | Error message if the last check failed.                                                    |

> Migration 03 dropped the original `has_update` and `local_digest` columns — `hasUpdate` is now computed on the fly per client by comparing each client's `repoDigests` against the cached `remote_digest`.

**`container_auto_update_manual`** _(migration 04)_

| Column        | Type    | Description                                                     |
| :------------ | :------ | :-------------------------------------------------------------- |
| `client_id`   | TEXT    | Composite PK part — client the container belongs to.            |
| `container_id`| TEXT    | Composite PK part — Docker container ID.                        |
| `added_at`    | TEXT    | ISO timestamp when the entry was enrolled.                      |

---

## 🔐 Authentication Flow

- **Local Login**: Username/password validated against bcrypt hashes in SQLite. A JWT is returned on success.
- **OIDC Login**: Full PKCE flow — the backend generates the authorization URL, handles the callback, exchanges the code for tokens, fetches userinfo from the provider, and issues a local JWT.
- **Agent Auth**: Agents connect via WebSocket using a permanent `authToken` (obtained during registration). The token is validated against the database and the source IP is checked against configured network rules.
- **First Run**: If no users exist, `AuthService.initializeAdmin()` creates an `admin` user with the default password `"admin"`. **This should be changed immediately after first login.**

---

## ⚙️ Configuration (`src/config/AppConfig.ts`)

The backend reads its configuration from `server/config.yaml` (and environment variables). The config is loaded at startup and written back when settings are updated via the API.

**Key configuration sections:**

| Section             | Description                                                       |
| :------------------ | :---------------------------------------------------------------- |
| `jwtSecret`         | Auto-generated on first run if not present.                       |
| `jwtExpiresIn`      | JWT session lifetime (e.g. `"24h"`). Unset ⇒ non-expiring.        |
| `oidc`              | OIDC provider settings (`enabled`, `issuer`, `client_id`, etc.).  |
| `settings`          | Retention/cleanup values (stored as strings): `retention_invalid_tokens_*`, `image_version_cache_*`, `image_update_check_interval_seconds`, `container_auto_update_*`. |
| `security.allowed_networks`  | CIDR ranges permitted to connect as agents.              |
| `security.trusted_networks`  | CIDR ranges that bypass per-client IP validation.        |

---

## 📦 Key Dependencies

| Package                | Version   | Purpose                          |
| :--------------------- | :-------- | :------------------------------- |
| `fastify`              | ^5.x      | HTTP framework                   |
| `@fastify/websocket`   | ^11.x     | WebSocket support                |
| `@fastify/jwt`         | ^9.x      | JWT middleware                   |
| `@fastify/cors`        | ^10.x     | CORS headers                     |
| `@fastify/static`      | ^9.x      | Frontend static file serving     |
| `better-sqlite3`       | ^11.x     | Synchronous SQLite3              |
| `umzug`                | ^3.x      | Database migration management    |
| `bcryptjs`             | ^3.x      | Password hashing                 |
| `openid-client`        | ^6.x      | OIDC / PKCE client               |
| `node-cron`            | ^4.x      | Scheduled cleanup tasks          |
| `yaml`                 | ^2.x      | Config file parsing              |
| `pino`                 | ^9.x      | Structured logging               |
