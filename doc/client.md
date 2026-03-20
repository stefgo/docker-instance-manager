# 🤖 Client Agent Architecture

This documentation details the architecture of the Node.js client agent (`client/`), which runs on the machines managed by the Docker Instance Manager.

## 💻 Platform Support

The client agent supports multiple architectures:

- **x86_64 (amd64)**: Standard Docker image `dim-client`.
- **ARM64 (aarch64)**: Dedicated Docker image `dim-client-arm64`, optimized for devices like Raspberry Pi.

## 📂 Project Structure

The client is a lightweight, headless Node.js process designed to run as a daemon (either via Docker or systemd). It maintains a persistent WebSocket connection to the central server and exposes a local web UI for setup and status monitoring.

```
client/src/
├── core/
│   ├── Config.ts      # Configuration management (YAML-based, with authToken storage)
│   ├── Connection.ts  # Persistent WebSocket connection to the server
│   ├── Version.ts     # Agent version detection (VERSION file, git tags, git hash)
│   └── logger.ts      # Pino logger setup
├── web/
│   ├── server.ts      # Local Fastify HTTP server (port 3001)
│   └── public/
│       ├── register.html  # Client registration UI
│       ├── status.html    # Connection status dashboard
│       ├── styles.css     # Dark-theme stylesheet
│       └── favicon.svg
└── index.ts           # Application entry point
```

---

## 🏗️ Core Components

### 1. Configuration (`src/core/Config.ts`)

Manages the client's YAML configuration file (`config.yaml`). Supports reading, updating, and persisting configuration while preserving YAML comments.

**Config keys:**

| Key          | Description                                                                 |
| :----------- | :-------------------------------------------------------------------------- |
| `clientId`   | Unique client UUID. Generated automatically on first run.                   |
| `logLevel`   | Log verbosity (`debug`, `info`, `warn`, `error`). Default: `info`.          |
| `serverUrl`  | HTTP(S) URL of the management server (e.g., `https://manager:3000`).        |
| `authToken`  | Permanent authentication token. Populated automatically after registration. |

### 2. WebSocket Connection (`src/core/Connection.ts`)

Manages the persistent WebSocket connection to the server at the `ws/agent` endpoint.

- **Authentication**: Sends the `authToken` as a query parameter on connect. Immediately sends an `AUTH` message with `{hostname, version}`.
- **Heartbeat**: Server sends a PING every 30 seconds; the client responds with PONG. If no ping is received within 35 seconds, the connection is considered dead and a reconnect is triggered.
- **Reconnection**: Automatically reconnects after a 5-second delay on any disconnection or error.
- **Message Routing**: Incoming messages are dispatched via a `switch` on the `type` field.

**Handled events:**

| Event          | Direction       | Description                                              |
| :------------- | :-------------- | :------------------------------------------------------- |
| `AUTH`         | Client → Server | Initial handshake with hostname and version.             |
| `AUTH_SUCCESS` | Server → Client | Confirms connection is authenticated and active.         |
| `AUTH_FAILURE` | Server → Client | Authentication rejected; logged, no automatic retry.     |

### 3. Local Web Server (`src/web/server.ts`)

A local Fastify HTTP server running on **port 3001**, used for initial setup and status monitoring.

**Pages:**

| Route       | Description                                                                   |
| :---------- | :---------------------------------------------------------------------------- |
| `GET /`     | Redirects to `/status` if registered, otherwise to `/register`.               |
| `GET /register` | Registration UI — form to enter Server URL and Registration Token.        |
| `GET /status`   | Status dashboard — shows server reachability, auth token, and connection state. |

**API endpoints:**

| Route                        | Method | Description                                                          |
| :--------------------------- | :----- | :------------------------------------------------------------------- |
| `/api/status/server?url=...` | GET    | Checks if the server is reachable via `GET {serverUrl}/api/v1/ping`. |
| `/api/status/auth`           | GET    | Returns `{hasAuthToken: boolean}`.                                   |
| `/api/status/connection`     | GET    | Returns `{connected: boolean}` (live WebSocket state).               |
| `/api/connect`               | POST   | Attempts to establish a WebSocket connection.                        |
| `/api/register`              | POST   | Performs registration: calls `POST {serverUrl}/api/v1/register`.     |

### 4. Version Detection (`src/core/Version.ts`)

Resolves the agent version with the following priority:

1. `VERSION` file in the working directory (written by Docker build via `generate-version.sh`).
2. Exact `git tag` on the current commit.
3. Fallback: `{branch}-{short-hash}[-dirty]`.

---

## 🔄 Registration Flow

Registration is a one-time setup step performed via the local web UI:

1. Open `http://localhost:3001` in a browser → redirected to `/register`.
2. Enter the **Server URL** (e.g., `https://manager.example.com`) and a **Registration Token** (generated in the server's token management UI).
3. The UI checks server reachability (`GET /api/v1/ping`).
4. On success, the client calls `POST /api/v1/register` with `{token, clientId, hostname}`.
5. The server responds with a permanent `authToken`.
6. The client saves `authToken` and `serverUrl` to `config.yaml`.
7. The client connects via WebSocket automatically.

---

## 🗄️ Data Storage

The client stores all persistent state in `config.yaml`. There is no local database — the client is stateless beyond its identity (`clientId`) and connection credentials (`authToken`).

> Note: `better-sqlite3`, `node-cron`, and `umzug` packages are present as dependencies but are not currently used. They are reserved for future capabilities such as local job scheduling and history buffering.

---

## 🔐 Security Notes

- The `authToken` is stored in plain text in `config.yaml`. Secure the file using appropriate filesystem permissions.
- The client accepts self-signed TLS certificates during registration (required for development/self-hosted setups).
- Agent connections are validated server-side by IP address against configured `allowed_networks` and `trusted_networks`.

---

## 📦 Key Dependencies

| Package              | Version | Purpose                          |
| :------------------- | :------ | :------------------------------- |
| `fastify`            | ^5.x    | Local web server                 |
| `@fastify/static`    | ^9.x    | Static file serving              |
| `ws`                 | ^8.x    | WebSocket client                 |
| `yaml`               | ^2.x    | Config file parsing              |
| `pino`               | ^10.x   | Structured logging               |
| `pino-pretty`        | ^13.x   | Human-readable log output        |
