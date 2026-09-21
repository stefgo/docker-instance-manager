# 🤖 Client Agent Architecture

This documentation details the architecture of the Node.js client agent (`client/`), which runs on the machines managed by the Docker Instance Manager.

## 🔁 Connection Modes

The two modes are named **from the server's point of view**, and that is the only reading
used anywhere — in `CONNECTION_MODE` (`shared/src/constants.ts`), in the `clients.connection_mode`
column, in the REST API and in the dashboard:

| Mode | Who dials | What the agent needs |
| :--- | :--- | :--- |
| `inbound` | The agent dials the server (`/ws/agent` on the server) | `serverUrl` and an `authToken`; the agent owns the reconnect ladder. The server checks the source address against `clients.inbound_allowed_ip`. |
| `outbound` | The server dials the agent (`/ws/register` and `/ws/agent` on the agent's own web server) | A reachable `listenPort` (default 3001) and, for the first contact, the [setup PIN](#setup-pin-srccoresetuppints) from the agent's log or `DIM_REGISTRATION_SECRET`; the server owns the reconnect ladder and stores the agent's address as `outboundTargetAddress`. |

Read from the agent's side the words invert — an `outbound` client is the one that receives a
connection — so agent-side code and logs name the **mode**, not the local direction.

## 💻 Platform Support

`ghcr.io/stefgo/dim-client` is one multi-arch image for **x86_64 (`linux/amd64`)** and **ARM64 (`linux/arm64`)**, e.g. a Raspberry Pi; `docker pull` picks the matching variant. See [Container Images](install.md#container-images) for the tags.

## 📂 Project Structure

The client is a lightweight, headless Node.js process designed to run as a daemon (either via Docker or systemd). It maintains a persistent WebSocket connection to the central server and exposes a local web UI for setup and status monitoring.

```
client/src/
├── core/
│   ├── Config.ts              # What the operator wrote: read once, validated, frozen
│   ├── ConfigFile.ts          # The config.yaml document itself: read, edit, write back
│   ├── Connection.ts          # Persistent WebSocket connection & message routing
│   ├── DataStore.ts           # The agent's data directory: atomic JSON read/write
│   ├── Identity.ts            # The clientId/authToken pair in identity.json
│   ├── RegistrationState.ts   # serverUrl, registration secret, the derived agent mode
│   ├── ServerHttp.ts          # HTTP(S) requests to the server, certificate check decided per call
│   ├── SetupPin.ts            # The PIN that guards registration, inbound and outbound
│   └── Version.ts             # Agent version detection (VERSION file, git tags, git hash)
├── services/
│   ├── ActivityService.ts     # Activity events: correlation scopes, queue, at-least-once delivery
│   ├── AutoUpdateService.ts   # The host's own auto-update: schedules, registry check, catch-up
│   ├── DockerEventMapper.ts   # One Docker event -> the activity event it stands for
│   ├── DockerService.ts       # Dockerode wrapper: state snapshots, actions, event stream
│   ├── PolicyService.ts       # The auto-update policy the server sent, stored and reloaded
│   └── SelfUpdateService.ts   # Self-update via helper container (Docker-in-Docker)
├── web/
│   ├── server.ts              # Local Fastify HTTP server (listenPort, default 3001)
│   └── public/
│       ├── register.html      # Client registration UI
│       ├── status.html        # Connection status dashboard
│       ├── styles.css         # Dark-theme stylesheet
│       └── favicon.svg
└── index.ts                   # Application entry point
```

---

## 🏗️ Core Components

### 1. Configuration (`src/core/Config.ts`, `ConfigFile.ts`, `Identity.ts`, `RegistrationState.ts`)

Four modules, along one line: **configuration is what the operator wrote, state is what the
agent was given.**

| Module | Owns | Persisted in |
| :--- | :--- | :--- |
| `Config.ts` | The settings from `config.yaml`, validated against `AgentConfigSchema` and **frozen** — nothing writes to them at runtime. | `config.yaml` (read only) |
| `ConfigFile.ts` | The YAML document itself, so an edit keeps the operator's comments, order and spelling. | `config.yaml` |
| `Identity.ts` | The `clientId` and `authToken` the server issued. Never in `config.yaml`: the operator does not write them, and the write has to be atomic. | `identity.json` in the data directory |
| `RegistrationState.ts` | What a registration changes — the server URL, the registration secret once it is used — plus the agent mode derived from them. | server URL written back to `config.yaml`; the secret comes from the environment and is only dropped from memory |

A `config.yaml` from an older version that still holds `clientId` and `authToken` is migrated
at the next start: the pair is written to `identity.json`, and only once that worked are the
two keys removed from `config.yaml` together with their comments.

**Agent mode** (`getAgentMode()`) is derived in one place: no identity is `unregistered`, an
identity with a `serverUrl` is `inbound` (the agent dials), an identity without one is
`outbound` (the server dials). It is logged once at startup.

**Config keys:**

| Key            | Description                                                                 |
| :------------- | :-------------------------------------------------------------------------- |
| `logLevel`     | Log verbosity (`trace`…`fatal`, `silent`). Default: `info`, or `LOG_LEVEL` where the file says nothing. A value that is not a level is ignored with a warning. |
| `serverUrl`    | HTTP(S) URL of the management server (e.g., `https://manager:3000`). Set it by hand, or let a registration through the web UI write it. Absent in outbound mode. |
| `dockerSocket` | Override path to the Docker socket. Auto-detected (Docker Desktop on macOS uses `~/.docker/run/docker.sock`, otherwise `/var/run/docker.sock`). |
| `allowSelfSignedCertificates` | Accept a server certificate that does not validate, for registration and the WebSocket connection. Default `false`. A value that is not `true` or `false` is ignored with a warning. |
| `allowedNetworks` | IPv4 addresses or CIDR networks the server may dial `/ws/register` and `/ws/agent` from. Empty (default) allows every address. |
| `listenPort` | Port of the local web server (default `3001`). `DIM_CLIENT_PORT` wins over it. |
| `enableStatusPage` | Serve `/status` (default `true`). |
| `enableRegisterPage` | Serve `/register` and accept `POST /api/register` while the agent is unregistered (default `true`). Both close once it has an identity. |

### 2. WebSocket Connection (`src/core/Connection.ts`)

Manages the persistent WebSocket connection to the server at the `ws/agent` endpoint, presenting `clientId` and `token` in the query string. It does not dial at all until both halves are stored.

- **Authentication**: Sends the `authToken` as a query parameter on connect. Immediately sends an `AUTH` message with `{hostname, version, capabilities}`. `capabilities` is what this build can do (currently `auto-update` and `project-query`); the server reads it instead of comparing version strings, and an agent that predates a capability simply does not name it.
- **Heartbeat**: Server sends a PING every 30 seconds; the client responds with PONG. If no ping is received within 35 seconds, the connection is considered dead and a reconnect is triggered.
- **Reconnection**: After a disconnect or a failed attempt the agent waits 5, 10, 30 and then 60 seconds between attempts, plus up to 3 seconds of random jitter each time, so a fleet does not return in lockstep after a server restart. The ladder is the same as the server's for outbound agents (`ClientConnector`). It restarts at 5 seconds only after a successful `AUTH_SUCCESS`, not merely when a socket opens. An attempt whose handshake does not finish within 5 seconds is terminated and counts as failed. All attempts run through one timer: a manual retry from the status page replaces a queued one, and a socket that has been superseded by a newer connection never schedules a reconnect of its own.
- **Message Routing**: `SERVER_MESSAGE_HANDLERS` is a `type → handler` table, and both message handlers — the connection the agent dials and the one the server dials — dispatch through `routeServerMessage()`. The two branches used to stand once per direction although the server sends the same messages either way. An unknown type is dropped: a server of a newer build may know messages this agent does not. `AUTH_SUCCESS` stays outside the table, in `connect()`, which ties the attempt timeout, the reconnect ladder and the promise it has to settle to it.

**Handled events:**

| Event                  | Direction       | Description                                                                                       |
| :--------------------- | :-------------- | :------------------------------------------------------------------------------------------------ |
| `AUTH`                 | Client → Server | Initial handshake with hostname, version and the agent's capabilities.                           |
| `AUTH_SUCCESS`         | Server → Client | Confirms connection is authenticated and active. Triggers an initial `DOCKER_UPDATE`.             |
| `AUTH_FAILURE`         | Server → Client | Not handled on its own: the server closes the socket right after it, and the agent goes back to its reconnect ladder like after any other close. |
| `DOCKER_UPDATE`        | Client → Server | Full Docker state snapshot (containers, images, volumes, networks).                                |
| `REQUEST_STATE_UPDATE` | Server → Client | Triggers an immediate re-scan and a fresh `DOCKER_UPDATE`.                                         |
| `DOCKER_ACTION`        | Server → Client | Instructs the agent to execute a Docker action (`container:*`, `image:*`, `volume:*`, `network:*`). |
| `DOCKER_ACTION_RESULT` | Client → Server | Result of a previously received `DOCKER_ACTION`, correlated via `actionId`.                        |
| `ACTIVITY`             | Client → Server | Events the agent has observed and has not had acknowledged yet, as a batch.                        |
| `AUTO_UPDATE_POLICY`   | Server → Client | The auto-update policy, every schedule already resolved. Stored on disk and acted on even while the server is away. |
| `AUTO_UPDATE_RUN`      | Server → Client | Run the configured auto-update now. Carries no payload — who takes part is this host's own reading.  |
| `ACTIVITY_ACK`         | Server → Client | The ids the server stored. The agent drops them from its queue.                                    |

After connect, `DockerService` starts a Docker event stream and pushes a fresh `DOCKER_UPDATE` whenever a relevant event occurs (container lifecycle, image pull/tag/delete, volume create/destroy, network create/destroy/connect). On the same connect the agent offers everything still in its activity queue.

#### How the protocol may change

Server and agent are updated separately, so every build has to speak to one of another age. Three rules make that possible, and they apply to both directions:

1. **A receiver drops what it does not know.** An unknown message type, an unknown field: noted in the debug log at most, never answered with an error and never a reason to close the connection. This is why most additions need nothing else.
2. **A new field is optional.** Making an existing field mandatory is a break and needs the same two steps as removing one: the sender first, the receiver a release later — never both in the same release.
3. **Vocabularies are read tolerantly.** An unknown value of an enum on the wire is normalised to a known one or passed through as it came; it never makes the message it sits in unusable. `ActivityEventSchema` is the worked example: `kind` is a plain string, `level` and `source` fall back to `info` and `agent`.

What makes the capability mechanism one-directional is an assumption about who is newer: the server updates its agents, so it is in practice never the older of the two. That is why there is only the "server asks what the agent can do" direction and no server capabilities in `AUTH_SUCCESS`. The day an agent offers something an older server would not merely drop but act on wrongly, that direction has to be added — until then it would be a mechanism without a case.

### 3. Local Web Server (`src/web/server.ts`)

A local Fastify HTTP server, used for initial setup and status monitoring. It listens on `listenPort` from `config.yaml` (default **3001**), which `DIM_CLIENT_PORT` overrides. The port matters beyond the web UI: in outbound mode the server dials `/ws/register` and `/ws/agent` on it, so a moved port has to be reflected in the client's target address on the server side.

#### Serving it over TLS

Plain HTTP unless `config.yaml` carries a `tls` block:

```yaml
tls:
    cert: /etc/dim/agent.crt
    key: /etc/dim/agent.key
```

Relative paths resolve against the agent's directory. Both files are read and checked at startup, and **a `tls` block that cannot be read ends the start** rather than falling back to HTTP — an agent configured for TLS that quietly served plaintext would hand its auth token out on `/ws/register` while looking perfectly healthy. The log line after `listen()` names the scheme actually in use, as does the setup PIN block.

With TLS on, the client's target address on the server has to say so: `wss://host:port`. The two are set separately and have to agree — an address written `wss://` against an agent serving HTTP fails to connect, and a bare address against a TLS agent does too.

A reverse proxy terminating TLS in front of the agent works just as well; leave `tls` unset, point the proxy at the plain port and write the client's target address as `wss://`. Note that `allowedNetworks` then sees the proxy's address, not the server's, because this Fastify runs without `trustProxy` (see [Security Notes](#-security-notes)).

Self-signed certificates are the normal case here. The server verifies the agent's certificate unless `security.allow_self_signed_agent_certificates` is set in its own `config.yaml` — see [install.md](install.md).


#### Which routes are served

Settled at startup from `config.yaml` (`getWebRoutes()`):

| Routes | Served when |
| :----- | :---------- |
| `/status`, `/api/status/connection`, `/api/status/config`, `POST /api/connect` | `enableStatusPage` (default `true`) |
| `/register`, `POST /api/register` | `enableRegisterPage` (default `true`); closed once the agent is registered |
| `/`, `/api/status/server`, `/api/status/auth`, the static files | either page is enabled |
| `/ws/register`, `/ws/agent` | outbound mode: no `serverUrl` |
| `/api/health` | the agent runs in its container image (`DIM_CONTAINER=true`); answers loopback only |

A `serverUrl` means inbound mode, which needs no route here — the agent dials the server.
Without one, an unregistered agent waits on `/ws/register` for the server to register it
with the setup PIN (or `DIM_REGISTRATION_SECRET`), and a registered one needs `/ws/agent`.
`/ws/register` refuses every caller once the agent has an identity. Since the routes are
fixed at startup while the mode is not, `/ws/agent` also refuses a connection once the agent
has been registered inbound through its register page.

The register page closes the same way, per request rather than at startup: once the agent
has an identity, `/register` redirects to `/status` (or answers `404` without a status page),
`register.html` is no longer served and `POST /api/register` answers `404`. The setup PIN is
dropped with the registration, so there is nothing left the page could do. The status page
then shows how to start over instead of a link to the register page.

The static handler leaves out the HTML file of a disabled or closed page, so `/status.html` is not a
way around `enableStatusPage: false`. With no page and no outbound mode, the server
binds `127.0.0.1` for the health route alone; outside the container it then does not start
at all, and says so in the log.

**Pages:**

| Route       | Description                                                                   |
| :---------- | :---------------------------------------------------------------------------- |
| `GET /`     | Redirects to `/register` while the register page is open, otherwise to `/status`. |
| `GET /register` | Registration UI — form to enter Server URL, Registration Token and setup PIN. Only while the agent is unregistered. |
| `GET /status`   | Status dashboard — shows server reachability, auth token, and connection state. |

![The agent's status page, showing the connection mode, the configured server, the token and a live connection](assets/screenshots/agent-status.png)

*The status page of a registered inbound agent.*

**API endpoints:**

| Route                        | Method | Description                                                          |
| :--------------------------- | :----- | :------------------------------------------------------------------- |
| `/api/status/server?url=...` | GET    | Checks if the server is reachable via `GET {serverUrl}/api/v1/ping`. |
| `/api/status/auth`           | GET    | Returns `{hasAuthToken, statusPage}` — whether the agent is registered, and whether the register page may link on to the status page. |
| `/api/status/connection`     | GET    | Returns `{connected: boolean}` (live WebSocket state).               |
| `/api/health`                | GET    | Liveness for the image's `HEALTHCHECK`: `{status: "ok"}` while the agent process answers. Independent of the server connection. Served only in the container image and only to loopback; `404` for everyone else. |
| `/api/connect`               | POST   | Attempts to establish a WebSocket connection.                        |
| `/api/register`              | POST   | Performs registration: checks the setup PIN, then calls `POST {serverUrl}/api/v1/register`. Body `{url, token, pin}`; `400` names the invalid field (`url` must be http or https), `403` on a wrong PIN. Only available while `enableRegisterPage` is not `false`, and `404` once the agent is registered. |

**WebSocket routes (server dials the agent):** `/ws/register` and `/ws/agent` first check the peer address against `allowedNetworks`. An empty list allows every address. `/ws/agent` then checks both halves of the identity from the query string — the `token` against the stored `authToken` and the `clientId` against the stored one, each mismatch closing with `4001 Unauthorized`. The id is checked as well as the token because a target address pointed at the wrong host would otherwise hand that host somebody else's Docker actions.

### 4. Docker Service (`src/services/DockerService.ts`)

Wraps the [`dockerode`](https://github.com/apocas/dockerode) client and is responsible for everything Docker-related on the host:

- **State snapshots**: `getState()` lists containers, images, volumes and networks, inspects each container to capture its configured `image`, and normalises the result into `DockerState` from `@dim/shared`.
- **Event stream**: Subscribes to the Docker event API. A relevant event pushes a fresh `DOCKER_UPDATE`, and one that stands for something worth reporting also becomes an activity event (`DockerEventMapper`). The event's **content** used to be thrown away here — the watcher looked only at whether the action was relevant. Reading it is what makes an exit code, an OOM kill, a health transition and a `die`/`start` pair inside one second reportable at all: none of them survives the comparison of two snapshots the server used to do in its place.
- **Actions**: Executes `DockerAction` requests dispatched by the server. Supported actions include `container:start|stop|restart|pause|unpause|remove|recreate`, `image:pull|update|remove|prune`, `volume:remove`, `network:remove`. `container:recreate` and `image:update` re-create affected containers so pulled image changes become effective. Each action is answered with a `DOCKER_ACTION_RESULT` carrying the original `actionId`.
- **Validation of server messages**: `Connection` checks every `DOCKER_ACTION` against `DockerActionSchema` from `@dim/shared` before it reaches Dockerode — known action, `target` present (empty only for `image:prune`), `params` an object. A rejected action that carries an `actionId` is answered immediately with `success: false` and the offending field, so the server does not wait out its timeout; one without an `actionId` is logged and dropped. `REGISTRATION_REQUEST` on `/ws/register` is checked the same way before the secret is compared and the auth token stored. Everything the agent sends goes through the typed `ProtocolMap` entries (`AUTH`, `DOCKER_UPDATE`, `DOCKER_ACTION_RESULT`) instead of hand-built JSON.
- **Image update**: `updateImage(target)` pulls the image and recreates every container running it. `image:update` is only one of its callers — it sits apart from `executeAction` so the agent can trigger the same work on a schedule of its own.
- **Self-update hand-off**: When `image:update` targets the agent's own container, execution is delegated to `SelfUpdateService` (see below).

### 5. Activity Service (`src/services/ActivityService.ts`)

What the agent has seen, on its way to the server.

- **Events, not sentences.** `DockerEventMapper` turns one Docker event into a `kind`, a `level`, a subject and a `data` object — `container.died` with its exit code, `container.health` with its status, `container.oom`. The wording is written in the dashboard, so an agent of an older version keeps reporting usable facts. Volumes, networks, renames and pauses move the state and are pushed as such, but have no kind: inventing one the dashboard cannot phrase would put an unreadable line in the list.
- **Correlation scopes.** `executeAction` opens a scope keyed on the server's `actionId` and tells it which containers the work is about to touch, *before* it touches them — `updateImage` adds each affected container as it resolves the list. Every event about a covered subject is stamped with that id on its way past. This is the side doing the work, so nothing is matched by name and nothing depends on a time window. A scope closes as soon as it has seen the events it said to expect; a 15-second grace window is only the fallback for one that never comes.
- **At-least-once delivery.** The agent gives each event its id and keeps it until the server acknowledges that id with `ACTIVITY_ACK` — not until it has been sent. The queue is offered again on every reconnect, and a minute after a batch that went out but was not acknowledged — the server withholds the ack for what it failed to store. The id makes a second copy a no-op on the server. That is what makes an unattended run with the server switched off fully accounted for once the server is back. The queue holds at most 500 events; past that the oldest go first.

### 6. Policy Service (`src/services/PolicyService.ts`)

The auto-update policy, as the server last sent it: which label enrols a container, which
label delays it, this host's schedule for everything outside a project, and one schedule per
project.

- **It belongs to the server.** It arrives whole and is replaced whole, and there is no local
  override for any of it — DIM is where auto-update is configured, and a value that could be
  changed on the host would make the dashboard lie about what the fleet does.
- **Every schedule in it is already resolved.** The inheritance (default → host → project)
  is the server's business, so nothing here has to know about it, and an agent of an older
  build cannot get it subtly wrong.
- **It is kept on disk** (`policy.json`), so an agent that comes up without a server knows
  what it is supposed to do — the last known policy, not none at all. A stored file that does
  not parse is discarded rather than repaired: the server sends a fresh one on the next
  connect.
- The message is validated before it is stored. It decides when the agent recreates
  containers on its host, and a malformed one must not become the plan it acts on.

### 7. Auto-Update Service (`src/services/AutoUpdateService.ts`)

Runs the auto-update this host is configured for, on this host's own clock. The agent owns
the truth about its host, so it also owns the decision to act on it: it resolves who takes
part from the labels in front of it, asks the registry itself, and recreates what has a newer
image. No server is in the loop — one that is down at three in the morning costs nothing but
the reporting, which is queued and handed over when it is back.

- **One `node-cron` task per schedule**: one per project that updates itself, plus this
  host's own for everything outside a project. They are rebuilt whenever a new policy
  arrives. Two schedules carrying the same expression stay two runs with two `runId`s.
- **Who takes part** is read off the containers on every run, never stored: the configured
  label enrols a container, so does membership of a project that is switched on, and the
  label carrying `false` opts out and beats both.
- **Which project a container belongs to** is resolved here, with `resolveAssignment` from
  `@dim/shared` against the queries in the policy. Client criteria use the `host` identity the
  policy carries, so the answer matches the dashboard's. The agent declares the
  `project-query` capability; without it the server sends no projects.
- **Which schedule a container is on** follows its project, whatever enrolled it — a labelled
  container inside a project moves with it rather than updating an hour before the database
  it talks to. Schedules are keyed `project:<id>`.
- **A container that matches several projects** is on none of their schedules. Carrying the
  auto-update label, it runs on the host schedule (if the host has one) and the host run
  reports `autoupdate.conflict` as a warning. Otherwise it is not updated, and every run of a
  project it matches reports `autoupdate.conflict` as an error — once per run, so the report
  repeats for as long as the overlap exists.
- **One registry call per image**, not per container, and the per-container delay label
  (`dim.auto-update-delay`) is measured against the remote image's own creation date. A
  postponed container reports `autoupdate.skipped`.
- **Every run carries a `runId`** on everything it causes, and closes with one
  `autoupdate.run` carrying the counts and the check result per image. A run that changed
  nothing reports nothing — otherwise every host would file a line per project every night to
  say there was nothing to do.
- **Runs are serialised and jittered.** Two schedules firing together must not pull the same
  image twice, and a fleet configured from one place would otherwise reach for the registry
  in the same second.
- **A run can be asked for** (`AUTO_UPDATE_RUN`, sent by
  `POST /api/v1/clients/:clientId/auto-update/run` for one host at a time; the dashboard has
  no button for it). Every schedule this host holds then runs, each with its own `runId`, queued behind whatever is
  already running. It skips the jitter and reports even when there was nothing to do, because
  there is a reader waiting for an answer; the events carry `manual: true`. The command brings
  no list of containers — the host holds the better one.
- **Missed runs are made up.** `node-cron` knows nothing of the time the process was not
  running, so a host that is off overnight would never update and never say so. The expected
  date is stored with the expression it was computed from; if it has passed, the run is made
  up **once** (however many dates went by) a few minutes after start, and the
  `autoupdate.run` says so. An expression that has changed since is not made up: the stored
  date belongs to a plan that no longer exists. This covers the clock change as well — a
  schedule at 02:30 does not exist in the night the clocks go forward.
- **An interrupted run is repeated**, because half a run is not a run. It is recognised by a
  start that has no end, and reported as `autoupdate.interrupted` — unless the run ended by
  recreating this agent's own container, which is by design and only resumes.

### 8. Self-Update Service (`src/services/SelfUpdateService.ts`)

Allows the agent to update its own container without breaking the WebSocket round-trip:

1. Detects that the action target is the agent's own container (via `/.dockerenv` + `HOSTNAME`).
2. Pulls the new image.
3. Spawns a short-lived **helper container** from the new image with `DIM_HELPER_MODE=true` and `DIM_OLD_CONTAINER=<old-id>` in its environment.
4. The helper container stops the old container, recreates it with the same config (ports, env, mounts, networks) from the new image, and then removes itself.

### 9. Version Detection (`src/core/Version.ts`)

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
6. The client saves the identity to `identity.json` in its data directory and the `serverUrl` to `config.yaml`. A write that fails is reported on the register page rather than logged away: the agent is connected, but would come back unregistered.
7. The client connects via WebSocket automatically.

![The agent's registration form, asking for server URL, registration token and setup PIN](assets/screenshots/agent-register.png)

*The registration form, with the server URL already filled in from `config.yaml`.*

### Outbound registration

The server registers the agent itself when it cannot be reached from the agent:

1. The operator opens **Add Client → the server connects to the agent** in the dashboard and enters the agent's address and its **Setup PIN** from the log.
2. The server dials `/ws/register` and sends `REGISTRATION_REQUEST` with the PIN, a fresh `authToken` and the `clientId` it issued.
3. The agent accepts `DIM_REGISTRATION_SECRET` if one is set, otherwise the current setup PIN, stores the identity in `identity.json` and answers `REGISTRATION_SUCCESS`.
4. The server opens `/ws/agent` with that identity.

Nothing has to be written into `config.yaml` for this. For an unattended rollout, where nobody
reads the agent's log, set `DIM_REGISTRATION_SECRET` — or `DIM_REGISTRATION_SECRET_FILE`
naming a file that holds it, such as a Docker secret — and enter that value in the wizard
instead. It is read from the environment only; setting both variables, or a file that cannot be
read or is empty, stops the agent. Once used it is dropped from memory and the log asks for it to
be removed from the environment. A `registrationSecret` left in `config.yaml` by an earlier
version is ignored with a warning.

### Setup PIN (`src/core/SetupPin.ts`)

`POST /api/register` and `/ws/register` decide which server the agent obeys from then on —
and with it, who controls the host's Docker socket. Both listen on every interface, so they
are guarded by a PIN that is printed to the agent's log once the web server listens:

```
──────────────────────────────────────────────
  Setup PIN:  K7QM-3XRD
  Web UI:     http://<this-host>:3001/register
  Outbound:   enter it in the server's Add Client wizard
  The PIN is required to register this agent.
──────────────────────────────────────────────
```

- Read it with `docker logs dim-client` (or wherever the agent logs to). Case and the hyphen do not matter.
- It is generated at every start of an unregistered agent and never written to `config.yaml`. The `Web UI` line appears only with the register page, the `Outbound` line only while an agent without `serverUrl` is unregistered.
- It is dropped with the first successful registration, and the register page closes with it. To register an agent again, delete `identity.json` from its data directory and restart it — it then prints a new PIN — and delete the client's old entry on the server.
- After 5 wrong attempts — on either route — the PIN is replaced by a new one (also logged), which ends online guessing without locking the operator out.
- With `enableRegisterPage: false` neither the page nor `POST /api/register` exists. A PIN is then generated only while the agent also has no `serverUrl` and no `DIM_REGISTRATION_SECRET`.

---

## 🔁 Process Lifecycle (`src/index.ts`)

- **Startup:** checks the Docker API version (exits if too old), then starts the local web server with the routes `config.yaml` calls for (none at all: no server) and waits for it, then plans the auto-update schedules, then opens the connection to the server. The schedules are planned **before** the connection on purpose: they belong to the host, not to the link, so an agent that comes up while the server is unreachable still updates what it was last told to update. A failed `listen()` is logged and the agent continues without its web UI, as before; an unusable `listenPort` ends the start before that, because a silent fallback would put the agent on a port nobody expects.
- **Unhandled promise rejections** are logged at `error` level and the agent keeps running, so it stays connected to the server that manages this host.
- **Uncaught exceptions** are logged at `fatal` level and the process exits with code 1 after 250 ms (time for the pino transport to flush), to be restarted by the supervisor (`restart: unless-stopped` in `compose.yaml`).
- Both handlers are registered only after startup, and not at all in self-update helper mode (`DIM_HELPER_MODE=true`), which is a one-shot process with its own exit codes.
- `SIGINT` / `SIGTERM` stop the web server and exit with code 0.

---

## 🗄️ Data Storage

`config.yaml` holds what the operator wrote. Everything the agent was given and has to
survive a restart lives in its **data directory** (`src/core/DataStore.ts`):

| File | Owner | Contents |
| :--- | :---- | :------- |
| `identity.json` | the server | The `clientId` and `authToken` from registration. Lose it and the agent has to be registered again. |
| `policy.json` | the server | The auto-update policy, replaced whole on every `AUTO_UPDATE_POLICY`. |
| `state.json`  | the agent  | Per schedule: when it last ran and when it is next due. Written by the auto-update runs. |
| `queue.json`  | the agent  | Activity events the server has not acknowledged yet. |

- **Where it is.** `/app/client/data` in the container, or `<client>/data` beside the source
  outside one; `DIM_CLIENT_DATA_DIR` overrides both. It is deliberately **not** next to
  `config.yaml`: that file is a single-file bind mount, so anything written beside it lives
  in the container's own filesystem and is gone with the next recreate — which is every
  self-update. `compose.yaml` mounts a named volume here, and it has to stay one.
- **Writes are atomic**: a temporary file, then a rename. A host that loses power mid-write
  is exactly the situation this state exists for, and a half-written file is what rename
  cannot leave behind.
- **A damaged file is discarded, not fatal.** An agent that will not start because of its own
  scratch file is the worse failure — the connection an operator would fix it over is the one
  it is refusing to open.
- The activity queue holds at most 500 events and nothing older than seven days; the oldest
  go first. Writes are coalesced over a second, and a `SIGTERM` — or an uncaught exception —
  flushes what is pending before the process ends.

Docker state is never persisted locally; it is recomputed from the Docker daemon on each
`DOCKER_UPDATE`. There is no local database.

---

## 🔐 Security Notes

- The `authToken` is stored in plain text in `identity.json` in the agent's data directory. Secure that directory using appropriate filesystem permissions; in the shipped `compose.yaml` it is a named volume.
- Registration — through the local web UI or by the server on `/ws/register` — requires the setup PIN from the agent's log (see [Setup PIN](#setup-pin-srccoresetuppints)), or on `/ws/register` alternatively `DIM_REGISTRATION_SECRET`. Set `enableRegisterPage: false` once no re-registration is expected.
- The server's TLS certificate is verified for registration and for the WebSocket connection. For a server with a self-signed certificate set `allowSelfSignedCertificates: true`; it then applies to both. The reachability check on the status and register pages always tolerates such a certificate — it sends nothing and only answers whether a DIM server responds. The decision is passed per request (`core/ServerHttp.ts`, the WebSocket options) and never through the process-wide `NODE_TLS_REJECT_UNAUTHORIZED`, which the agent used to set on its first request and never reset.
- Agent connections are validated server-side against `security.allowed_networks` and the client's own allowed address or network, which can be edited or switched off in the client editor.
- `allowedNetworks` in the agent's `config.yaml` restricts where the server may dial `/ws/register` and `/ws/agent` from (empty: no restriction). Refused connections are closed with `4003 Access denied` and logged with the peer address; the local web UI is not restricted.
- In outbound mode the agent's own certificate is what protects the session: the auth token travels in the `/ws/agent` query string, so without TLS it is readable by anything on the path. Set a `tls` block (see [Serving it over TLS](#serving-it-over-tls)) for any agent the server does not reach over a network you control.
- The `authToken` and `DIM_REGISTRATION_SECRET` are compared in constant time (`core/secrets.ts`), so a wrong value reveals nothing through how long the check took. The `clientId` beside the token is compared normally — it is not a secret and appears in every dashboard URL.

---

## 📦 Key Dependencies

| Package              | Version | Purpose                          |
| :------------------- | :------ | :------------------------------- |
| `fastify`            | ^5.x    | Local web server                 |
| `@fastify/static`    | ^10.x   | Static file serving              |
| `@fastify/websocket` | ^11.x   | `/ws/register` and `/ws/agent` for outbound mode |
| `ws`                 | ^8.x    | WebSocket client                 |
| `dockerode`          | ^5.x    | Docker Engine API client         |
| `node-cron`          | ^4.x    | The auto-update schedules        |
| `yaml`               | ^2.x    | Config file parsing              |
| `@dim/shared/node`   | workspace | Pino logger and `ImageUpdateService`, the same modules the server uses (`pino` ^10, `pino-pretty` ^13 are dependencies of `shared`) |
