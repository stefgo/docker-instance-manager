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
│   ├── Config.ts              # Configuration management (YAML-based, with authToken storage)
│   ├── Connection.ts          # Persistent WebSocket connection & message routing
│   ├── ServerHttp.ts          # HTTP(S) requests to the server, certificate check decided per call
│   └── Version.ts             # Agent version detection (VERSION file, git tags, git hash)
├── services/
│   ├── DockerService.ts       # Dockerode wrapper: state snapshots, actions, event stream
│   └── SelfUpdateService.ts   # Self-update via helper container (Docker-in-Docker)
├── web/
│   ├── server.ts              # Local Fastify HTTP server (port 3001)
│   └── public/
│       ├── register.html      # Client registration UI
│       ├── status.html        # Connection status dashboard
│       ├── styles.css         # Dark-theme stylesheet
│       └── favicon.svg
└── index.ts                   # Application entry point
```

---

## 🏗️ Core Components

### 1. Configuration (`src/core/Config.ts`)

Manages the client's YAML configuration file (`config.yaml`). Supports reading, updating, and persisting configuration while preserving YAML comments.

**Config keys:**

| Key            | Description                                                                 |
| :------------- | :-------------------------------------------------------------------------- |
| `clientId`     | Client UUID issued by the server at registration. Empty until then; never set by hand. |
| `logLevel`     | Log verbosity (`debug`, `info`, `warn`, `error`). Default: `info`.          |
| `serverUrl`    | HTTP(S) URL of the management server (e.g., `https://manager:3000`).        |
| `authToken`    | Permanent authentication token. Populated automatically after registration. |
| `dockerSocket` | Override path to the Docker socket. Auto-detected (Docker Desktop on macOS uses `~/.docker/run/docker.sock`, otherwise `/var/run/docker.sock`). |

### 2. WebSocket Connection (`src/core/Connection.ts`)

Manages the persistent WebSocket connection to the server at the `ws/agent` endpoint.

- **Authentication**: Sends the `authToken` as a query parameter on connect. Immediately sends an `AUTH` message with `{hostname, version}`.
- **Heartbeat**: Server sends a PING every 30 seconds; the client responds with PONG. If no ping is received within 35 seconds, the connection is considered dead and a reconnect is triggered.
- **Reconnection**: After a disconnect or a failed attempt the agent waits 5, 10, 30 and then 60 seconds between attempts, plus up to 3 seconds of random jitter each time, so a fleet does not return in lockstep after a server restart. The ladder is the same as the server's for outbound agents (`ClientConnector`). It restarts at 5 seconds only after a successful `AUTH_SUCCESS`, not merely when a socket opens. An attempt whose handshake does not finish within 5 seconds is terminated and counts as failed. All attempts run through one timer: a manual retry from the status page replaces a queued one, and a socket that has been superseded by a newer connection never schedules a reconnect of its own.
- **Message Routing**: `SERVER_MESSAGE_HANDLERS` is a `type → handler` table, and both message handlers — the connection the agent dials and the one the server dials — dispatch through `routeServerMessage()`. The two branches used to stand once per direction although the server sends the same messages either way. An unknown type is dropped: a server of a newer build may know messages this agent does not. `AUTH_SUCCESS` stays outside the table, in `connect()`, which ties the attempt timeout, the reconnect ladder and the promise it has to settle to it.

**Handled events:**

| Event                  | Direction       | Description                                                                                       |
| :--------------------- | :-------------- | :------------------------------------------------------------------------------------------------ |
| `AUTH`                 | Client → Server | Initial handshake with hostname and version.                                                     |
| `AUTH_SUCCESS`         | Server → Client | Confirms connection is authenticated and active. Triggers an initial `DOCKER_UPDATE`.             |
| `AUTH_FAILURE`         | Server → Client | Authentication rejected; logged, no automatic retry.                                              |
| `DOCKER_UPDATE`        | Client → Server | Full Docker state snapshot (containers, images, volumes, networks).                                |
| `REQUEST_STATE_UPDATE` | Server → Client | Triggers an immediate re-scan and a fresh `DOCKER_UPDATE`.                                         |
| `DOCKER_ACTION`        | Server → Client | Instructs the agent to execute a Docker action (`container:*`, `image:*`, `volume:*`, `network:*`). |
| `DOCKER_ACTION_RESULT` | Client → Server | Result of a previously received `DOCKER_ACTION`, correlated via `actionId`.                        |

After connect, `DockerService` starts a Docker event stream and pushes a fresh `DOCKER_UPDATE` whenever a relevant event occurs (container lifecycle, image pull/tag/delete, volume create/destroy, network create/destroy/connect).

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
| `/api/health`                | GET    | Liveness for the image's `HEALTHCHECK`: `{status: "ok"}` while the agent process answers. Independent of the server connection. |
| `/api/connect`               | POST   | Attempts to establish a WebSocket connection.                        |
| `/api/register`              | POST   | Performs registration: checks the setup PIN, then calls `POST {serverUrl}/api/v1/register`. Body `{url, token, pin}`; `400` names the invalid field (`url` must be http or https), `403` on a wrong PIN. Only available while `enableRegisterPage` is not `false`. |

**WebSocket routes (server dials the agent):** `/ws/register` and `/ws/agent` first check the peer address against `allowedNetworks`. An empty list allows every address.

### 4. Docker Service (`src/services/DockerService.ts`)

Wraps the [`dockerode`](https://github.com/apocas/dockerode) client and is responsible for everything Docker-related on the host:

- **State snapshots**: `getState()` lists containers, images, volumes and networks, inspects each container to capture its configured `image`, and normalises the result into `DockerState` from `@dim/shared`.
- **Event stream**: Subscribes to the Docker event API and emits a debounced `DOCKER_UPDATE` to the server whenever a relevant container/image/volume/network event occurs.
- **Actions**: Executes `DockerAction` requests dispatched by the server. Supported actions include `container:start|stop|restart|pause|unpause|remove|recreate`, `image:pull|update|remove|prune`, `volume:remove`, `network:remove`. `container:recreate` and `image:update` re-create affected containers so pulled image changes become effective. Each action is answered with a `DOCKER_ACTION_RESULT` carrying the original `actionId`.
- **Validation of server messages**: `Connection` checks every `DOCKER_ACTION` against `DockerActionSchema` from `@dim/shared` before it reaches Dockerode — known action, `target` present (empty only for `image:prune`), `params` an object. A rejected action that carries an `actionId` is answered immediately with `success: false` and the offending field, so the server does not wait out its timeout; one without an `actionId` is logged and dropped. `REGISTRATION_REQUEST` on `/ws/register` is checked the same way before the secret is compared and the auth token stored. Everything the agent sends goes through the typed `ProtocolMap` entries (`AUTH`, `DOCKER_UPDATE`, `DOCKER_ACTION_RESULT`) instead of hand-built JSON.
- **Self-update hand-off**: When `image:update` targets the agent's own container, execution is delegated to `SelfUpdateService` (see below).

### 5. Self-Update Service (`src/services/SelfUpdateService.ts`)

Allows the agent to update its own container without breaking the WebSocket round-trip:

1. Detects that the action target is the agent's own container (via `/.dockerenv` + `HOSTNAME`).
2. Pulls the new image.
3. Spawns a short-lived **helper container** from the new image with `DIM_HELPER_MODE=replace` and `DIM_OLD_CONTAINER=<old-id>` in its environment.
4. The helper container stops the old container, recreates it with the same config (ports, env, mounts, networks) from the new image, and then removes itself.

### 6. Version Detection (`src/core/Version.ts`)

Resolves the agent version with the following priority:

1. `VERSION` file next to the build output (written by `scripts/generate-version.sh` during `npm run build` and the Docker build). The script takes `APP_VERSION` first, then the version from the root `package.json` (with `+<hash>` when the commit carries no release tag) — see [development.md](development.md#version-injection).
2. Without that file, during development: exact `git tag` on the current commit.
3. Fallback: `{branch}-{short-hash}[-dirty]`.

---

## 🔄 Registration Flow

Registration is a one-time setup step performed via the local web UI:

1. Open `http://localhost:3001` in a browser → redirected to `/register`.
2. Enter the **Server URL** (e.g., `https://manager.example.com`), a **Registration Token** (generated in the server's token management UI) and the **Setup PIN** from the agent's log.
3. The UI checks server reachability (`GET /api/v1/ping`).
4. The agent verifies the setup PIN before it contacts the server, then calls `POST /api/v1/register` with `{token, hostname}`.
5. The server responds with the client's identity: a `clientId` and a permanent `authToken`, both issued by the server.
6. The client saves `clientId`, `authToken` and `serverUrl` to `config.yaml`.
7. The client connects via WebSocket automatically.

### Setup PIN (`src/core/SetupPin.ts`)

`POST /api/register` decides which server the agent obeys from then on — and with it, who
controls the host's Docker socket. The endpoint listens on every interface, so it is guarded by
a PIN that is printed to the agent's log once the web server listens:

```
──────────────────────────────────────────────
  Setup PIN:  K7QM-3XRD
  Web UI:     http://<this-host>:3001/register
  The PIN is required to register this agent.
──────────────────────────────────────────────
```

- Read it with `docker logs dim-client` (or wherever the agent logs to). Case and the hyphen do not matter.
- It is generated at every start and never written to `config.yaml`.
- It stays required after the first registration, because re-registering from the status page is supported. After every successful registration a new PIN is generated and logged, so each PIN works once.
- After 5 wrong attempts the PIN is replaced by a new one (also logged), which ends online guessing without locking the operator out.
- With `enableRegisterPage: false` neither the page nor `POST /api/register` exists, and no PIN is generated.

---

## 🔁 Process Lifecycle (`src/index.ts`)

- **Startup:** checks the Docker API version (exits if too old), then starts the local web server if needed and waits for it, then opens the connection to the server. A failed `listen()` on port 3001 is logged and the agent continues without its web UI, as before.
- **Unhandled promise rejections** are logged at `error` level and the agent keeps running, so it stays connected to the server that manages this host.
- **Uncaught exceptions** are logged at `fatal` level and the process exits with code 1 after 250 ms (time for the pino transport to flush), to be restarted by the supervisor (`restart: unless-stopped` in `compose.yaml`).
- Both handlers are registered only after startup, and not at all in self-update helper mode (`DIM_HELPER_MODE=true`), which is a one-shot process with its own exit codes.
- `SIGINT` / `SIGTERM` stop the web server and exit with code 0.

---

## 🗄️ Data Storage

The client stores all persistent state in `config.yaml`. There is no local database — the client is stateless beyond its identity (`clientId`) and connection credentials (`authToken`). Docker state is never persisted locally; it is recomputed from the Docker daemon on each `DOCKER_UPDATE`.

---

## 🔐 Security Notes

- The `authToken` is stored in plain text in `config.yaml`. Secure the file using appropriate filesystem permissions.
- Registration through the local web UI requires the setup PIN from the agent's log (see [Setup PIN](#setup-pin-srccoresetuppints)). Set `enableRegisterPage: false` once no re-registration is expected.
- The server's TLS certificate is verified for registration and for the WebSocket connection. For a server with a self-signed certificate set `allowSelfSignedCertificates: true`; it then applies to both. The reachability check on the status and register pages always tolerates such a certificate — it sends nothing and only answers whether a DIM server responds. The decision is passed per request (`core/ServerHttp.ts`, the WebSocket options) and never through the process-wide `NODE_TLS_REJECT_UNAUTHORIZED`, which the agent used to set on its first request and never reset.
- Agent connections are validated server-side against `security.allowed_networks` and the client's own allowed address or network, which can be edited or switched off in the client editor.
- `allowedNetworks` in the agent's `config.yaml` restricts where the server may dial `/ws/register` and `/ws/agent` from (empty: no restriction). Refused connections are closed with `4003 Access denied` and logged with the peer address; the local web UI is not restricted.

---

## 📦 Key Dependencies

| Package              | Version | Purpose                          |
| :------------------- | :------ | :------------------------------- |
| `fastify`            | ^5.x    | Local web server                 |
| `@fastify/static`    | ^10.x   | Static file serving              |
| `ws`                 | ^8.x    | WebSocket client                 |
| `dockerode`          | ^4.x    | Docker Engine API client         |
| `yaml`               | ^2.x    | Config file parsing              |
| `@dim/shared/node`   | workspace | Pino logger, the same module the server uses (`pino` ^10, `pino-pretty` ^13 are dependencies of `shared`) |
