# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Docker Instance Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a layered architecture: **Routes → Controllers → Services → Repositories**.

```
server/backend/src/
├── config/
│   └── AppConfig.ts       # Configuration management (JWT, OIDC, settings, security)
├── controllers/           # HTTP and WebSocket request handlers
│   ├── AuthController.ts
│   ├── ClientController.ts
│   ├── SettingsController.ts
│   ├── TokenController.ts
│   ├── UserController.ts
│   └── WebSocketController.ts
├── core/                  # Core infrastructure
│   ├── Database.ts        # SQLite initialization & migration runner
│   ├── logger.ts          # Pino logger configuration
│   └── migrations/
│       └── 00_initial.ts  # Initial database schema
├── repositories/          # Database access layer
│   ├── ClientRepository.ts
│   ├── TokenRepository.ts
│   └── UserRepository.ts
├── routes/
│   └── api.ts             # Fastify route registration (all endpoints)
├── services/              # Business logic
│   ├── AuthService.ts     # Authentication, OIDC flow, JWT
│   ├── ProxyService.ts    # WebSocket connection management & broadcasting
│   └── SettingsService.ts # Settings retrieval, update & persistence
├── utils/
│   └── networkUtils.ts    # CIDR/IPv4 network validation helpers
└── index.ts               # Fastify server setup & entry point
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
- Settings: `GET/PUT /api/v1/settings/cleanup`

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
| `SettingsController`    | Retrieve and update retention settings and security network configuration.    |
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

#### `SettingsService`
- `getAllSettings()` — Returns all settings keys and the security configuration.
- `getSetting(key)` / `updateSetting(key, value)` — Get or update a single setting.
- `updateSettings(settings, security)` — Batch update settings and/or security networks, persisted to `config.yaml`.

### 4. Repositories (`src/repositories/`)

Repositories encapsulate all database queries using `better-sqlite3` (synchronous).

| Repository          | Tables accessed                | Key operations                                    |
| :------------------ | :----------------------------- | :------------------------------------------------ |
| `ClientRepository`  | `clients`                      | CRUD, lookup by authToken, update last_seen/version. |
| `TokenRepository`   | `registration_tokens`          | Create with expiry, mark as used, delete.         |
| `UserRepository`    | `users`                        | CRUD, lookup by username, password hash management. |

### 5. WebSocket Controller (`src/controllers/WebSocketController.ts`)

**Dashboard WebSocket (`/ws/dashboard`):**
- Verifies JWT from query parameter.
- Sends the current client list immediately on connect.
- Runs a 30-second ping/pong heartbeat.
- Registered in `ProxyService` to receive all broadcasts.

**Agent WebSocket (`/ws/agent`):**
- 4-step authentication: token lookup → global IP whitelist → per-client IP check → 5-second AUTH handshake.
- On success: updates `last_seen`, `ip_address`, `version` in the database; registers in `ProxyService`; broadcasts `CLIENTS_UPDATE` to all dashboards.
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
| `oidc`              | OIDC provider settings (`enabled`, `issuer`, `client_id`, etc.).  |
| `settings`          | Retention policy values (stored as strings).                      |
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
