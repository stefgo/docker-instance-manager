# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Docker Instance Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a layered architecture: **Routes → Controllers → Services → Repositories**.

```
server/backend/src/
├── config/
│   └── AppConfig.ts                       # Configuration management (JWT, OIDC, settings, security)
├── controllers/                           # HTTP and WebSocket request handlers
│   ├── ActivityController.ts              # Activity list, seen state, deletion
│   ├── AuthController.ts
│   ├── ClientController.ts
│   ├── DockerController.ts                # Docker state, actions, image update checks
│   ├── ProjectController.ts               # Query-defined container groups DIM carries a setting for
│   ├── SettingsController.ts
│   ├── TokenController.ts
│   ├── UserController.ts
│   ├── WebSocketController.ts
│   └── websocket/
│       ├── AgentMessageRouter.ts          # Dispatch table for messages from authenticated agents
│       ├── AgentSession.ts                # The AUTH handshake and connection lifecycle, both directions
│       └── Heartbeat.ts                   # Shared ping/pong heartbeat for all WebSocket kinds
├── core/                                  # Core infrastructure
│   ├── Database.ts                        # SQLite initialization & migration runner
│   └── migrations/
│       ├── 00_initial.ts                  # Initial database schema
│       ├── 01_docker_state.ts             # docker_state table
│       ├── 02_image_update_checks.ts      # image_update_checks table
│       ├── 03_image_update_checks_drop_columns.ts
│       ├── 04_container_auto_update.ts    # container_auto_update_manual table (dropped again in 12)
│       ├── 05_notifications.ts            # notifications table (dropped again in 13)
│       ├── 06_connection_mode.ts          # clients.connection_mode
│       ├── 07_rename_inbound_allowed_ip.ts
│       ├── 08_token_registration_defaults.ts  # display name and allowed address per token
│       ├── 09_inbound_last_ip.ts          # clients.inbound_last_ip
│       ├── 10_notification_steps.ts       # correlated steps, carried into activity by 13
│       ├── 11_projects.ts                 # projects table (by Compose name, superseded by 16)
│       ├── 12_drop_manual_auto_update.ts  # drops container_auto_update_manual
│       ├── 13_activity.ts                 # activity table; drops notifications
│       ├── 14_client_auto_update_cron.ts  # clients.auto_update_cron
│       ├── 15_activity_trace_level.ts     # the trace level on activity
│       ├── 16_project_queries.ts          # projects rebuilt around id and query
│       ├── 17_image_update_checks_platform.ts # image_update_checks keyed by platform and local digest
│       ├── 18_image_update_check_labels.ts # remote_labels on image_update_checks
│       ├── 19_scheduler_state.ts          # scheduler_state: last run and state per scheduler
│       └── 20_registration_token_hash.ts  # registration_tokens: store the SHA-256 hash only
├── repositories/                          # Database access layer
│   ├── ActivityRepository.ts              # activity access (insert, dedup, retention)
│   ├── ClientRepository.ts
│   ├── DockerStateRepository.ts           # docker_state + image_update_checks access
│   ├── ProjectRepository.ts               # projects access
│   ├── SchedulerStateRepository.ts        # scheduler_state access
│   ├── TokenRepository.ts
│   └── UserRepository.ts
├── routes/
│   └── api.ts                             # Fastify route registration (all endpoints)
├── services/                              # Business logic
│   ├── AuthService.ts                     # Authentication, OIDC flow, JWT
│   ├── SessionCookie.ts                   # The httpOnly session cookie and the readable flag beside it
│   ├── ClientConnector.ts                 # Dials an outbound client's agent
│   ├── DockerStateService.ts              # Persist/retrieve Docker state snapshots
│   ├── ActivityService.ts                 # Activity ingest, dedup, ack + dashboard broadcast
│   ├── NotificationCleanupService.ts      # Retention cleanup for the activity list
│   ├── ImageUpdateCacheCleanupService.ts  # Scheduled image_update_checks cleanup
│   ├── ImageUpdateCheckSchedulerService.ts # Periodic registry update sweep
│   ├── ScheduledJob.ts                    # Timer, run bookkeeping and status of a scheduler
│   ├── AutoUpdatePolicyService.ts         # Resolves the auto-update policy and sends it to the agents
│   ├── AutoUpdateRunService.ts            # Asks agents to run, reads back what they did
│   ├── ProxyService.ts                    # WebSocket connection management & broadcasting
│   ├── SettingsService.ts                 # Settings retrieval, update & persistence
│   └── TokenCleanupService.ts             # Scheduled cleanup of invalid registration tokens
├── types/
│   └── fastify.d.ts                       # Fastify request/instance augmentations
└── index.ts                               # Fastify server setup & entry point
```

---

## 🏗️ Core Components

### 1. Routes (`src/routes/api.ts`)

All routes are registered as a single Fastify plugin under the `/api` prefix. Protected routes apply `request.jwtVerify()` middleware.

**Public routes:**
- `POST /api/login` — Local authentication; sets the session cookies
- `POST /api/auth/logout` — Clears the session cookies
- `GET /api/auth/config` — Auth type configuration
- `GET /api/auth/login` — OIDC redirect
- `GET /api/auth/callback` — OIDC callback; sets the session cookies and redirects to `/`
- `POST /api/v1/register` — Client self-registration
- `GET /api/health` — Liveness (process + database), used by the container `HEALTHCHECK`
- `GET /api/v1/ping` — Reachability ("is there a DIM server at this URL"), checks nothing on purpose

**Protected routes (JWT required):**
- Session: `GET /api/v1/me` — id, username and expiry of the current session
- Users: `GET/POST /api/v1/users`, `PUT/DELETE /api/v1/users/:userId`
- Clients: `GET /api/v1/clients`, `POST /api/v1/clients/outbound`, `PUT/DELETE /api/v1/clients/:clientId`, `POST /api/v1/clients/:clientId/reconnect`, `POST /api/v1/clients/:clientId/auto-update/run`
- Tokens: `GET/POST /api/v1/tokens`, `DELETE /api/v1/tokens/:tokenHash`
- Docker: `GET /api/v1/clients/:clientId/docker`, `POST /api/v1/clients/:clientId/docker/action`, `POST /api/v1/clients/:clientId/docker/refresh`, `GET /api/v1/docker/images/check-update`
- Settings: `GET/PUT /api/v1/settings/cleanup`, `POST /api/v1/settings/cleanup/{invalid-tokens,image-version-cache,notifications}`, `GET /api/v1/settings/scheduler-status`, `POST /api/v1/settings/image-update-check/run`, `POST /api/v1/settings/container-auto-update/validate-cron`, `GET /api/v1/settings/container-auto-update/label`
- Projects: `GET/POST /api/v1/projects`, `POST /api/v1/projects/preview`, `PATCH/DELETE /api/v1/projects/:id`
- Activity: `GET/DELETE /api/v1/activity`, `POST /api/v1/activity/seen`

The full reference is in [api.md](api.md).

**WebSocket routes:**
- `GET /ws/dashboard` — Dashboard real-time feed (JWT from the `dim_session` cookie)
- `GET /ws/agent` — Client agent connection (clientId + authToken via query params)

### 2. Controllers (`src/controllers/`)

Controllers parse HTTP/WebSocket input, delegate to services, and format responses.

**Input validation.** Every handler that reads a body or a query string runs it through a Zod schema from `@dim/shared` first and answers `400` with `firstIssue(error)` — the path of the first failing field plus the Zod message — before touching a repository, the config file or an agent:

```ts
const parsed = CreateUserSchema.safeParse(request.body);
if (!parsed.success) {
    return reply.code(400).send({ error: firstIssue(parsed.error) });
}
const { username, password, auth_methods } = parsed.data;
```

`request.body as any` does not appear in the controllers any more. Rules about a combination of fields (a `local` user needs a password, a cron expression has to be valid) stay in the controller; the schema describes the shape. `request.user` is typed through `src/types/fastify.d.ts` as `{ username: string; id: number }` — exactly what `jwt.sign` puts into the token.

| Controller              | Responsibilities                                                              |
| :---------------------- | :---------------------------------------------------------------------------- |
| `AuthController`        | Local login, OIDC redirect & callback, PKCE flow management.                 |
| `UserController`        | User CRUD — enforces self-deletion prevention and minimum user count.         |
| `ClientController`      | Client list (with live status and capabilities), adding an outbound client, editing display name, allowed address, target address and auto-update schedule, deletion, reconnecting an outbound client, asking one agent to run its auto-update. |
| `TokenController`       | Registration token generation, listing, deletion, and client self-registration. |
| `DockerController`      | Docker state retrieval, action dispatch to agents, image update checks. Records `action.requested` under the action's id and `action.failed` when it does not come back. |
| `ActivityController`    | The activity list, per-user seen state, deletion of all of it.               |
| `ProjectController`     | Project list, query preview, create/update/delete with the one-project-per-container check (`409`). |
| `SettingsController`    | Retrieve/update the `settings` block of `config.yaml` (never `security`), trigger manual cleanups. |
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

- **Agent tracking**: `registerClient` / `unregisterClient` — manages the map of connected agent WebSockets. A new connection under an id that is already connected replaces the old one, which is closed with `4000 Replaced by new connection`.
- **Capabilities**: `registerClient` also keeps what the agent declared in its `AUTH`. `hasCapability(clientId, capability)` is what server-side decisions ask; `getCapabilities` reports the list onwards (`null` while offline); `getConnectedClientIds` lists who is connected. Capabilities live with the connection, not in the database: they describe the build on the wire.
- **Dashboard tracking**: `addDashboardClient` / `removeDashboardClient` — manages all active dashboard sessions.
- **Status enrichment**: `getClientsWithStatus()` — augments database records with live online/offline status.
- **Broadcasting**: `broadcastClientUpdate()` sends `CLIENTS_UPDATE` to all dashboards; `broadcastToDashboard()` multicasts arbitrary messages.
- **Fire-and-forget**: `sendFireAndForget(clientId, type, payload)` — one-way message to an agent.
- **Docker state**: `handleDockerUpdate(clientId, state)` persists the snapshot via `DockerStateService` and rebroadcasts it as `DOCKER_STATE_UPDATE` to all dashboards.
- **Docker actions**: `requestDockerAction(clientId, action, timeoutMs = 120_000)` sends a `DOCKER_ACTION` and resolves with the agent's `DOCKER_ACTION_RESULT`. Each pending action remembers the client **and the socket** it went out on: the agent answers over that socket, so when it closes — disconnect, or a new connection replacing it — the action fails at once instead of after two minutes. A failure is a `DockerActionError` with `reason` `not-connected`, `disconnected` or `timeout`. A result is only accepted from the client the action was sent to. Results are also rebroadcast to dashboards.

#### `ClientConnector`
The server's side of **outbound** clients, the ones the server dials.

- `connectAll()` — At startup, after `listen()`: dials every stored outbound client that has an auth token. One without a token cannot be retried here, because registering needs the agent's setup PIN (or secret) from the dashboard.
- `firstConnect(id, address, secret, onPersist)` — Adding a client: registers on the agent's `/ws/register` (handing over the setup PIN or secret, a fresh auth token and the server-issued id), then opens `/ws/agent`. `onPersist` writes the client only once `AUTH` has succeeded; on failure nothing is stored and the reason from the handshake is returned.
- `connectClient(client)` — A regular session on `<scheme>://<outboundTargetAddress>/ws/agent?clientId=…&token=…`, with a 10-second connect timeout. The scheme comes from the stored address: an address written `wss://host:port` is dialled over TLS, a bare `host:port` over plaintext. One helper decides scheme and certificate handling for all three dial sites, so the query — which carries the auth token — is also what keeps it out of the log line. After an open socket the session is handed to `WebSocketController.handleOutboundAgentConnection`.
- `scheduleReconnect(clientId)` — Reconnects after 5, 10, 30 and then every 60 seconds, the same delays the agent uses for inbound connections. The ladder restarts once a socket opens.
- `disconnectClient(clientId)` — Cancels a pending reconnect and resets the ladder; used before deleting, reconnecting or re-addressing a client.

#### `DockerStateService`
- `update(clientId, state)` — Upserts the snapshot in the `docker_state` table and returns the stored `DockerState` (with `updatedAt`).
- `getByClientId(clientId)` — Returns the last persisted state, or `null`.
- Nothing else. It used to diff the new snapshot against the previous one to report container changes; the agent reports what it sees on the Docker event stream instead, which carries an exit code, an OOM kill, a health transition and the operation that caused them — none of which exists in the difference between two snapshots.

#### `ActivityService`
Activity events are structured facts — `kind`, `level`, a subject, a `data` object — recorded by whoever observed them. Nothing in the backend writes a sentence: the text is composed in the frontend out of `kind` and `data`, so an agent of an older version stays useful and filtering by kind and level is exact rather than a search through prose.

- `list()` — Every event, newest first by `occurred_at`.
- `record(input)` — Records an event the **server** is the originator of. That is deliberately a short list: the connection state of an agent (`client.connected` / `client.disconnected`), a registration (`client.registered`), the request and outcome of an action a user asked for (`action.requested` / `action.failed`), an image update sweep the registry cut short (`imagecheck.interrupted`), and a scheduler run that threw (`scheduler.failed`, `error`, with `scheduler`, `trigger` and `error`). Everything that happens *on* a host is reported by that host.
- `handleBatch(clientId, payload)` — One `ACTIVITY` batch from an agent: validated, ingested, then acknowledged with `ACTIVITY_ACK`. Only the envelope is parsed as a whole; the events are parsed one by one. A batch whose envelope does not parse is dropped **without** an ack, so the agent keeps offering it — acknowledging what was never written would delete it on the only side that still had it. The one exception is an event that can never be stored: one that does not parse but carries an id is acknowledged without being stored and logged, because re-offering it changes nothing and the agent's in-order queue would stall behind it until its seven-day age limit.
- `ingest(clientId, events)` — Stores the batch and returns the ids the agent may drop. `source` and `clientId` are overwritten from the connection: an agent may only ever speak about itself. An `autoupdate.run` in the batch also hands its registry answers to `AutoUpdateRunService.applyReportedChecks`.
- `markManySeen` / `deleteAll` — Each broadcasts the new list as `ACTIVITY_UPDATE`; `markManySeen` only when it changed anything.

Delivery is at-least-once and the id comes from the originator, so a repeat is expected rather than an error: `ActivityRepository.insertMany` writes `ON CONFLICT DO NOTHING` inside one transaction, and the second copy of an event changes nothing. That is what makes an unattended run at three in the morning, with the server switched off, fully accounted for once the server is back.

#### Correlation
`correlation_id` is entered by whoever caused the group, never worked out by the receiver:

- An **action from the dashboard** is sent with an `actionId` the server generates. The server records `action.requested` under it, and the agent stamps the same id on every container and image event the action goes on to cause. The agent knows which containers it is about to touch *before* it touches them, because it is the side doing the work.
- An **auto-update run** (from the agent, once it runs its own) carries a `runId` on every event it causes and on the closing `autoupdate.run`.

This replaces the old `NotificationGroupService`, which matched a change to an operation by container name inside a 20-second window because the server only ever saw the result. Nothing matches names any more, nothing depends on arrival order, and an event delayed by an offline stretch still lands in its group hours later.

#### `ScheduledJob`
The timer, the bookkeeping and the status of one server scheduler; all four — `ImageUpdateCheckSchedulerService`, `ImageUpdateCacheCleanupService`, `NotificationCleanupService`, `TokenCleanupService` — hold one and differ only in the work they do.
- `run(trigger, work)` — Runs `work` as one recorded run (`trigger` is `schedule` or `manual`): `SchedulerStateRepository.markStarted` before, `markFinished` after, with `success`, or `partial` where the scheduler says so (the image update check, when a registry paused it). A run that throws is stored as `failed` with its message, recorded as `scheduler.failed` in the activity, and the exception is rethrown. Broadcasts `SCHEDULER_STATUS_UPDATE` when a run starts and when it ends.
- `start(runScheduled)` / `stop()` — The timer is a chain of timeouts rather than an interval. The first run comes one interval after the last run *started* — at once if that is already past — so a restart no longer pushes a due run back by a whole interval; without a stored run it comes one interval after startup, as before. An interval of `0` switches the timer off. Delays beyond what `setTimeout` takes (~24 days) are waited out in steps.
- `status()` — `{ isRunning, nextRun, lastRun }`, `lastRun` read from `scheduler_state`.

Each service's `run(trigger = "schedule")` goes through its job; the settings controller passes `"manual"`. `startScheduler()` / `stopScheduler()` / `restartScheduler()` and `getStatus()` delegate to it. At startup, `index.ts` calls `SchedulerStateRepository.markInterrupted()` before starting any of them.

#### `NotificationCleanupService`
Retention for the activity list. It keeps its old name because the settings it reads (`notification_retention_days`, `notification_retention_count`, `notification_cleanup_interval_hours`) are stored values and the page they are set on is still called "Notification History". Age is the event's own `occurred_at`, not its arrival time: a batch handed over after a week offline is a week old. Runs every `notification_cleanup_interval_hours`; returns `{ removed }`.

#### `ImageUpdateService` (from `@dim/shared/node`)
Lives in `shared/src/node/imageUpdate.ts`, not in `services/`: the agent asks the same registries the same question once it updates its images on its own, and the module needs nothing but `fetch` and the logger.
- `checkForUpdate(repoTag, repoDigests, platform?)` — Parses the image reference, authenticates against the registry (Docker Hub, `ghcr.io`, `lscr.io`) and fetches the manifest digest via a `HEAD /v2/{name}/manifests/{tag}` request. The local repoDigest is the digest of an index that covers every platform, so with `platform` (the one the local image was built for) the answer is about that platform only: equal index digests are answered by the `HEAD` request alone, so an image without an update costs one counted request; no image for it in the registry means no update and an error; differing index digests are resolved to the entries for the platform in the old index (fetched by the local digest) and the new one, and only a changed entry is an update. If the registry no longer has the old index, the change counts as an update. `platform.variant` is not looked at. Without `platform` the index digests are compared as they are. A request the registry refused is reported with its status in `error` (`Registry rate limit reached (429)`, `Registry denied access (401)`, `Tag not found in registry (404)`, `Registry request failed (HTTP 500)`, `Registry unreachable`), and a rate limit additionally sets `rateLimited` and `retryAfterSeconds` (the `Retry-After` header in seconds or as an HTTP date, `RATE_LIMIT_FALLBACK_SECONDS` = 3600 without one), which is what lets a sweep pause the registry instead of asking on. `ratelimit-remaining` is passed on as `rateLimitRemaining` where the registry sends it. Only when an update is found are the `org.opencontainers.image.*` labels of the new image read (`remoteLabels`): the platform manifest is one more counted request, the config blob none at Docker Hub. The rule that a missing old index counts as an update does not apply to a refused request: a registry that said nothing has not said the index is gone. Returns `{ repoTag, localDigest, remoteDigest, hasUpdate, platform?, remotePlatformDigest?, remoteLabels?, error?, rateLimited?, retryAfterSeconds?, rateLimitRemaining? }`.
- `fetchManifestCreatedDate(repoTag, platform?)` — The build date of the remote image for `platform` (null if the registry has none), used by the auto-update delay check. Without `platform`, `linux/amd64` is preferred on a manifest list.

#### `ImageUpdateCacheCleanupService`
- `run(trigger?)` — Removes orphaned `image_update_checks` rows (rows whose `image_ref` is no longer referenced by any client state, or whose `local_digest` no client holds any more) and rows older than `image_version_cache_ttl_days`. Returns `{ orphansRemoved, expiredRemoved }`.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Runs `run()` every `image_version_cache_cleanup_interval_hours`. `0` disables the scheduler. Automatically restarted when any `image_version_cache_*` setting changes.

#### `ImageUpdateCheckSchedulerService`
- `run(trigger?)` — Sweeps every image a container runs, once per tag, platform and local digest (`DockerStateRepository.getImageCheckTargets`), grouped by registry host (`registryOf`), calls `ImageUpdateService.checkForUpdate` with the image's platform, and persists the result. Returns how many targets it asked about; the stored result is `{ checked, total, pausedRegistries }`, and a run that paused a registry is `partial`. A sweep costs one counted registry request per image, and one more per image whose update it sees first.
  **A rate limit pauses its registry, not the sweep.** A limit belongs to the registry host — Docker Hub counts per IP or account across every repository — so once a check comes back `rateLimited`, the rest of *that registry's* targets are written without asking: `DockerStateRepository.recordImageCheckSkipped` stores the error and the timestamp and leaves `has_update` and `remote_digest` as they are, so the detail pages say why they got no newer answer while the update indicator keeps the last real one. The registry is then paused for `retryAfterSeconds`; the other registries are asked as before, and their images never get the rate-limit note. The run records `imagecheck.interrupted` (`warning`) with `registry`, `checked`, `total`, `error` and `retryAfterSeconds`.
  **Paused registries are skipped.** Scheduled runs leave a registry alone until its pause is over, and skip the run entirely while every registry is paused. The manual run (`trigger` `manual`) asks all of them and pauses a registry again if it refuses. A run skipped because every registry is paused is not recorded.
  **The registry state survives a restart.** Pauses, resume points, last checks and errors are saved to `scheduler_state.state` after every sweep and read back once, on first use after startup.
  **Each registry resumes where it stopped.** The first target left unasked is remembered per registry (by `imageCheckTargetKey`) and moved to the front of that registry's group in the next run, so a limit that returns every run does not keep asking about the same head of the list and never about its tail. A target that no client reports any more puts the group back on its natural order.
- `getStatus()` — `isRunning`, `nextRun`, `lastRun` and `registries`: one `RegistryStatus` per registry host of the current targets, with its target count, how many the last sweep asked, the last check, the pause, the last `ratelimit-remaining` and the error.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Interval driven by `image_update_check_interval_seconds`. `0` disables.

#### `AutoUpdateRunService`
The server's half of an auto-update it no longer performs. `ContainerAutoUpdateSchedulerService` is gone: it resolved eligibility from stored snapshots, asked the registries on the agents' behalf and dispatched one `image:update` action per container — all of which the host answers better, and none of which worked while the host was unreachable. What is left is configuration, a command, and observation.

- `trigger(clientId)` — Sends `AUTO_UPDATE_RUN` to one agent. It carries no list of containers: the host holds the better one. Returns whether the agent was asked, not what came of it — the run reports itself through its events. There is no fleet-wide counterpart any more: a `triggerAll()` could only answer with the number of commands sent, while the answer worth having is the report each host sends back.
- `applyReportedChecks(data)` — Writes the registry answers a run carried into `image_update_checks`, through `updateImageCheckResultIfNewer`. The table stays the dashboard's source for the update indicator, and a host that has just asked about its own images knows the answer before the server's own sweep comes round; the guard keeps a repeated or late batch from ageing a fresher result.

#### `AutoUpdatePolicyService`
- `buildFor(clientId)` — The `AUTO_UPDATE_POLICY` for one host: the enrolment label, the delay label, this host's schedule and every project with its schedule. Every expression is **already resolved**, so the agent never sees a `null` and never has to know the inheritance rules.
- The inheritance lives here and nowhere else: the default from `container_auto_update_cron`, then the host's `clients.auto_update_cron`, then the project's `cron`. `NULL` means "inherit" at every level. A host whose expression is **empty** takes part through its projects only — that is a statement about what is *outside* them, so a project without a schedule of its own falls back to the default rather than inheriting the emptiness and switching itself off with it.
- Every project is in the list, `autoUpdate: false` ones included: a container may be enrolled through its label while belonging to a project, and the project is what decides *when* it is updated. Each carries its query, which the agent evaluates itself against the `host` identity the policy carries (hostname and display name as the server stores them). Agents that did not declare `project-query` get an empty list: they would read a project as a Compose stack name.
- `sendTo(clientId)` / `broadcast()` — Sends it to one agent or to all connected ones. Only to agents that declared the `auto-update` capability in their `AUTH`; the rest would store something they never read. Called after `AUTH_SUCCESS`, after a change to one of the three settings the policy is built from, after any change to a project (which is global by definition), and after a client's own schedule is saved.
- `readAutoUpdateLabel()` / `readDelayLabelKey()` — The label settings, parsed, on their way into the policy. The agents resolve the labels themselves from that point on; nothing on the server reads them to decide anything.

#### `ProjectService`
- `listResponse()` — The managed projects, each with the clients, containers and distinct images assigned to it right now, plus `discovered`: the Compose project names whose containers belong to no project yet.
- `hostStates()` — Every reported host with its containers and the identity (hostname, display name) a query is matched against.
- Membership is never stored. It is resolved with `resolveAssignment` from `@dim/shared` — the same function the dashboard and the agents use. A container that matches several queries is a conflict: it counts as a member of each project and in their `conflictCount`, and the agents update it through none of them.
- `conflictsOf(query, excludeId)` / `preview(query, excludeId)` — The containers a query would share with other projects, and what it matches. Create and update refuse a query with conflicts (`409`).
- `normaliseCron(expr)` — An empty expression is not a schedule but the absence of one, and becomes `null` ("inherit").
- `validateCron(expr)` — Validates a cron expression via `node-cron`. It lives here because a project's schedule is the reason the server still knows about cron at all; it runs none of them.
- `broadcast()` — Sends `PROJECTS_UPDATE` with the full list response.

#### `TokenCleanupService`
- `run(trigger?)` — Removes registration tokens that have been invalid (used or expired) for longer than `token_retention_days`. Returns `{ removed }`.
- `startScheduler()` / `stopScheduler()` / `restartScheduler()` — Runs every `token_cleanup_interval_hours` (default `24`); `0` disables the scheduler. Restarted when `token_retention_days` or `token_cleanup_interval_hours` changes.

#### `SettingsService`
Reads and writes the `settings` block of `config.yaml` and nothing else — `security`, `jwtSecret` and the OIDC credentials are startup configuration without an API.
- `getAllSettings()` — The `settings` block, every default filled in.
- `getSetting(key)` — One value as a string, or `null` when empty or not a scalar.
- `updateSettings(settings)` — Merges already validated keys into the block and writes the file. Then acts on what changed: restarts the cache cleanup, the image-check sweep or the activity cleanup when one of their keys changed, broadcasts `AUTO_UPDATE_LABEL_UPDATE` for a new label, and sends every agent a fresh policy when one of the three `container_auto_update_*` keys changed.

### 4. Repositories (`src/repositories/`)

Repositories encapsulate all database queries using `better-sqlite3` (synchronous).

| Repository               | Tables accessed                          | Key operations                                                   |
| :----------------------- | :--------------------------------------- | :--------------------------------------------------------------- |
| `ClientRepository`       | `clients`                                | Create inbound/outbound, lookup by id and token as a pair (`findByIdAndToken`), update display name, addresses, schedule, auth token, last_seen/version. |
| `TokenRepository`        | `registration_tokens`                    | Create with expiry and optional defaults, find a valid one, mark as used, delete, retention cleanup. |
| `UserRepository`         | `users`                                  | CRUD, lookup by username, password hash management.              |
| `DockerStateRepository`  | `docker_state`, `image_update_checks`    | Upsert/query Docker snapshots; cache and clean up image checks. `updateImageCheckResultIfNewer` takes the answers an agent reported. |
| `ProjectRepository`      | `projects`                               | List/add/update/remove a project with its query.                 |
| `ActivityRepository`     | `activity`                               | Batch insert with primary-key dedup, seen state, deletion, retention. |
| `SchedulerStateRepository` | `scheduler_state`                      | Mark a run started and finished, save and read the state a scheduler carries, turn runs left in progress into `interrupted` at startup. |

### 5. WebSocket Controller (`src/controllers/WebSocketController.ts`)

**Dashboard WebSocket (`/ws/dashboard`):**
- Verifies the JWT from the `dim_session` cookie of the handshake (`4001` without or with an invalid one).
- Sends on connect: `CLIENTS_UPDATE`, the stored `DOCKER_STATE_UPDATE` of every client, and `ACTIVITY_UPDATE`.
- Attaches the 30-second ping/pong heartbeat before the JWT check.
- Registered in `ProxyService` to receive all broadcasts.

**Heartbeat (`src/controllers/websocket/Heartbeat.ts`):** all three connection kinds —
dashboard, inbound agent, outbound agent — use `attachHeartbeat(socket, onTimeout?)`: a ping
every 30 seconds, `terminate()` when the previous pong never arrived. It registers its own
`close` handler, so a socket closed during authentication cannot leave the interval running.

**Agent session (`src/controllers/websocket/AgentSession.ts`):** `attachAgentSession()` runs
an agent connection from the `AUTH` handshake to the close, and both connection kinds go
through it. Each used to carry its own copy: the same timeout, the same Zod check, the same
register/record/broadcast sequence and the same close block. That copy spanned the point
where a client is marked online, so a difference between the two would have shown up as a
host that is connected on one route and not on the other. What genuinely differs is a
parameter — `ip` is stored and recorded inbound but `null` and omitted outbound,
`onAuthenticated` is the hook the outbound path creates a new client from, and
`onAuthFailed` carries the reason, so the inbound route still answers `AUTH_FAILURE` only
for a first message that is not `AUTH`. The heartbeat stays outside: the inbound route
attaches it before its credential checks, so a rejected connection loses its ping timer too.

**Agent WebSocket (`/ws/agent`):**
- Authentication: id + token resolved as a pair (`findByIdAndToken`; either half missing is `4001`) → `security.allowed_networks` → outbound clients refused → per-client allowed address (skipped when switched off) → 5-second AUTH handshake.
- On success: updates `last_seen`, `version` and (inbound only) `inbound_last_ip` in the database; registers in `ProxyService` with the declared capabilities; answers `AUTH_SUCCESS`; sends the agent its `AUTO_UPDATE_POLICY` (from the shared session, because both directions send it at the same point and for the same reason); broadcasts `CLIENTS_UPDATE` to all dashboards. The agent then pushes a fresh `DOCKER_UPDATE` of its own.
- Outbound agents enter through `handleOutboundAgentConnection` over the socket `ClientConnector` opened, and from the handshake on run the same session as an inbound one. That path adds two things of its own: the first `AUTH` persists a newly added client, and a close schedules the reconnect.
- Incoming messages go through `routeAgentMessage()` (see below): `DOCKER_UPDATE` → `ProxyService.handleDockerUpdate()` (persist + rebroadcast), `DOCKER_ACTION_RESULT` → `ProxyService.handleDockerActionResult()` (resolve pending promise + rebroadcast), `ACTIVITY` → `ActivityService.handleBatch()` (store, broadcast, `ACTIVITY_ACK`).
- Connecting, disconnecting and registering are recorded as `client.connected`, `client.disconnected` and `client.registered`. They are the events only the server can observe — an agent cannot report that it is unreachable.
- `client.connected` and `client.disconnected` are recorded at level `trace` (migration 15 moved the ones already stored), because they happen routinely. Both carry `clientName` in `data` — the display name, else the hostname — so the line names its host even after the host has been renamed or removed.
- Both payloads are validated first (`DockerUpdatePayloadSchema`, `DockerActionResultSchema` from `@dim/shared`). The update schema checks only what the server reads — container `id`, `names`, `image`, `state`, `labels`; image `id`, `repoTags`, `repoDigests`; volume and network names — and lets every other field through, so an agent that reports more is never dropped. A malformed message is logged with the client id and the field and discarded; the last good state stays stored.
- On disconnect: unregisters from `ProxyService`; broadcasts updated client list.

**Message routing (`src/controllers/websocket/AgentMessageRouter.ts`):** what an
authenticated agent may send is one `type → handler` table, and both connection kinds
dispatch through it. The two branches used to stand once per kind although the messages are
identical in either direction, so a third type would have had to be added twice. An unknown
type is logged at debug and dropped — an agent of a newer build may know messages this
server does not.

The handshake is deliberately not in the table. `AUTH` is not something an authenticated
agent sends, and each connection kind ties its own side effects to it (clearing a timeout,
persisting a new client, resolving the caller's promise), which a table entry cannot carry.

---

## 🔁 Process Lifecycle (`src/index.ts`)

- **Startup is fail-fast.** Database migrations, OIDC discovery, the admin bootstrap, `listen()` on the configured port (`3000` by default) and the initial outbound connections run first; any error there logs and exits with code 1.
- **Unhandled promise rejections** are logged at `error` level and the process keeps running. The schedulers run async jobs on their own timers, and a stray rejection must not drop every agent and dashboard connection.
- **Uncaught exceptions** are logged at `fatal` level, the schedulers are stopped, and the process exits with code 1 after 250 ms (time for the pino transport to flush). The container supervisor restarts it (`restart: unless-stopped` in `compose.yaml`).
- Both handlers are registered only after startup completed, so they never hide a failed start.
- `SIGINT` / `SIGTERM` stop the schedulers and close the server gracefully (exit code 0).

---

## 📝 Logging

The logger lives in `shared/src/node/logger.ts` and is imported as `@dim/shared/node` — by the backend and the client agent alike. The same `loggerOptions` object is handed to Fastify, so application lines and request logs share one format and one `pino` instance. The backend used to carry its own copy on `pino@9` while Fastify resolved `pino@10`: two majors of the same library in one process.

- `LOG_FORMAT=json` forces JSON, `LOG_FORMAT=pretty` forces `pino-pretty`; without it, `NODE_ENV=production` means JSON and anything else pretty.
- `LOG_LEVEL` sets the level; `logLevel` in `config.yaml` applies when the variable is unset.
- `@dim/shared/node` is a separate entry point on purpose. The frontend imports `@dim/shared`, and anything Node-only exported from the main index would end up in the browser bundle. What needs Node goes behind `/node`; pure types, schemas and constants stay in the main index.
- `pino-pretty` is loaded by name inside pino's transport worker, not imported, so it has to stay a dependency of `shared` even though no file references it.

---

## 🗄️ Database Management

The backend uses **SQLite3** via `better-sqlite3` (synchronous API) for fast, embedded storage.

- **Location**: `server/backend/data/server.db` (created automatically on first run) — `/app/server/backend/data` in the image, which `compose.yaml` mounts as the `server-data` volume.
- **WAL mode**: Enabled for improved read/write concurrency.
- **Migrations**: Managed by `umzug`. All pending migrations are applied automatically on startup.

### Schema

**`clients`**

| Column        | Type     | Description                                              |
| :------------ | :------- | :------------------------------------------------------- |
| `id`          | TEXT PK  | Client UUID, issued by the server at registration.       |
| `hostname`    | TEXT     | Client hostname.                                         |
| `display_name`| TEXT     | Optional human-readable name.                            |
| `auth_token`  | TEXT     | Permanent token for WebSocket authentication (unique).   |
| `connection_mode` | TEXT | _(migration 06)_ `inbound` (default) or `outbound`.      |
| `inbound_allowed_ip` | TEXT | _(migrations 06 / 07)_ Inbound: the address or IPv4 network connections must come from. `NULL` switches the check off. |
| `inbound_last_ip` | TEXT | _(migration 09)_ Inbound: the address of the last successful authentication. Written only after the allowed-address check passed. |
| `outbound_target_address` | TEXT | _(migration 06)_ Outbound: `host:port` the server dials. |
| `version`     | TEXT     | Agent version reported on last connection.               |
| `auto_update_cron` | TEXT | _(migration 14)_ This host's auto-update schedule for containers in no project. `NULL` inherits the default from the settings; `''` means the host takes part through its projects only — the two are deliberately different values. |
| `last_seen`   | DATETIME | Timestamp of last successful connection.                 |
| `created_at`  | DATETIME | Creation timestamp.                                      |
| `updated_at`  | DATETIME | Last update timestamp.                                   |

> Migration 06 rebuilt `clients` and folded the original `allowed_ip` / `ip_address` columns into one; migration 07 renamed it to `inbound_allowed_ip`.

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
| `token_hash` | TEXT PK  | _(migration 20)_ SHA-256 (hex) of the random 32-character token. The token itself is only in the response that issued it. |
| `created_at` | DATETIME | Creation timestamp.                                      |
| `expires_at` | DATETIME | Expiry timestamp (30 minutes after creation).            |
| `used_at`    | DATETIME | Timestamp when a client registered with this token.      |
| `display_name` | TEXT   | _(migration 08)_ Name the client is created under. `NULL`: the agent's hostname. |
| `allowed_ip` | TEXT     | _(migration 08)_ Allowed address or network for the client. `NULL`: the address it registers from. |

**`docker_state`** _(migration 01)_

| Column       | Type     | Description                                                              |
| :----------- | :------- | :----------------------------------------------------------------------- |
| `client_id`  | TEXT PK  | FK → `clients(id)`, cascades on delete. No `PRAGMA` is needed: better-sqlite3 is built with `SQLITE_DEFAULT_FOREIGN_KEYS=1`. The same holds in migrations — one that drops and rebuilds `clients` deletes every stored state with it. |
| `containers` | TEXT     | JSON-encoded `DockerContainer[]`.                                        |
| `images`     | TEXT     | JSON-encoded `DockerImage[]`.                                            |
| `volumes`    | TEXT     | JSON-encoded `DockerVolume[]`.                                           |
| `networks`   | TEXT     | JSON-encoded `DockerNetwork[]`.                                          |
| `updated_at` | DATETIME | Timestamp of the most recent snapshot.                                   |

**`image_update_checks`** _(migration 17, replacing the table of migrations 02 / 03 without carrying its rows over; `remote_labels` since migration 18)_

| Column          | Type    | Description                                                                                |
| :-------------- | :------ | :----------------------------------------------------------------------------------------- |
| `image_ref`     | TEXT PK | Image reference (e.g. `nginx:latest`).                                                     |
| `platform`      | TEXT PK | `os/architecture` of the local image; empty for an agent that does not report it.         |
| `local_digest`  | TEXT PK | The local index digest the answer is about; empty for an image without a repoDigest.      |
| `has_update`    | INTEGER | The verdict of the platform-aware check.                                                   |
| `remote_digest` | TEXT    | Index digest fetched from the registry.                                                    |
| `checked_at`    | TEXT    | ISO 8601 timestamp of the last check. Used by the cache TTL cleanup.                       |
| `error`         | TEXT    | Error message if the last check failed.                                                    |
| `remote_labels` | TEXT    | JSON object of the new image's `org.opencontainers.image.*` labels, fetched only for an image with an update; NULL when never fetched. |

> The same tag is a different image on every platform, and a verdict only holds for the index it was answered about, so a row is read back only for an image with the same tag, platform and local digest. A re-pulled image stops matching its old row by itself; nothing is invalidated on a new state. `remote_labels` belongs to `remote_digest`, which is not part of the key: a write without labels keeps the stored ones while the remote digest stays the same, and drops them once it names another.

**`scheduler_state`** _(migration 19)_

One row per scheduler, written over on every run — there is no history. What is worth looking back on, a run that failed or was cut short, is in the activity list.

| Column             | Type    | Description                                                                          |
| :----------------- | :------ | :----------------------------------------------------------------------------------- |
| `scheduler`        | TEXT PK | `image-update-check`, `image-cache-cleanup`, `notification-cleanup`, `token-cleanup`. |
| `running_since`    | TEXT    | Start of the run in progress; NULL when none runs.                                   |
| `running_trigger`  | TEXT    | `schedule` or `manual`, for the run in progress.                                     |
| `last_started_at`  | TEXT    | Start of the last finished run.                                                      |
| `last_finished_at` | TEXT    | Its end; NULL for an `interrupted` run.                                              |
| `last_trigger`     | TEXT    | `schedule` or `manual`.                                                              |
| `last_status`      | TEXT    | `success`, `partial`, `failed` or `interrupted`.                                     |
| `last_result`      | TEXT    | JSON, per scheduler (`{ removed }`, `{ orphansRemoved, expiredRemoved }`, `{ checked, total, pausedRegistries }`). |
| `last_error`       | TEXT    | The message of a `failed` or `interrupted` run.                                      |
| `state`            | TEXT    | JSON the scheduler carries from one run to the next; only the image update check has any (`{ registries }`). |

> The running columns are kept apart from the `last_*` ones so the page goes on showing the last finished run during a long sweep. A row that still has `running_since` at startup belongs to a run the server did not live to finish; `markInterrupted` turns it into the last run, `interrupted`.

**`projects`** _(migration 16, replacing the table of migration 11 without carrying its rows over)_

| Column        | Type       | Description                                                                  |
| :------------ | :--------- | :--------------------------------------------------------------------------- |
| `id`          | TEXT PK    | UUID.                                                                        |
| `name`        | TEXT UNIQUE| Display name, free to choose.                                                |
| `query`       | TEXT       | JSON: the criteria that decide membership (see [Projects](api.md#-projects)).         |
| `auto_update` | INTEGER    | `0`/`1`. Switches auto-update for every container of the project.            |
| `cron`        | TEXT       | Schedule. `NULL` means *inherit the default from the settings*, not *off*.   |
| `created_at`  | TEXT       | ISO timestamp the entry was added.                                           |

Membership is deliberately absent: which containers belong to a project is resolved from the
query against what the agents report, so a container that stops matching leaves the project
without anything being cleaned up.

**`activity`** _(migration 13)_

| Column           | Type    | Description                                                                            |
| :--------------- | :------ | :------------------------------------------------------------------------------------- |
| `id`             | TEXT PK | Given by the originator. Delivery is at-least-once; the key is what makes a repeat a no-op. |
| `source`         | TEXT    | `agent` or `server`.                                                                   |
| `client_id`      | TEXT    | Whose host this is about. `NULL` for events about nothing in particular.               |
| `kind`           | TEXT    | e.g. `container.died`. Not constrained to the kinds this build knows.                  |
| `level`          | TEXT    | `trace`, `info`, `warning` or `error`. `trace` is routine bookkeeping the dashboard hides by default. |
| `correlation_id` | TEXT    | The run or action that caused this, entered by whoever caused it.                      |
| `subject`        | TEXT    | JSON: container name/id, image reference, Compose project.                             |
| `data`           | TEXT    | JSON: the facts of this kind — an exit code, a health status, a run's counts.          |
| `occurred_at`    | TEXT    | The originator's clock. Orders the list.                                               |
| `received_at`    | TEXT    | The server's clock. Tells a late arrival from a recent event, and exposes a wrong agent clock. |
| `seen_by`        | TEXT    | JSON array of user ids.                                                                |

Indexed on `occurred_at DESC` and on `correlation_id`. There is no message column: the text
is written in the frontend out of `kind` and `data`.

> `notifications` _(migrations 05 / 10)_ held server-written sentences and was dropped by migration 13 without carrying anything over. A notification is the result of comparing two snapshots; there is no way to read a kind, a level, a subject and a correlation back out of a finished sentence.

> `container_auto_update_manual` _(migration 04)_ held the manual per-container enrollments and was dropped again by migration 12. Its entries were not carried over: they name single containers, and the only thing left to enrol them with is their Compose stack — which holds more containers than were ever on the list.

---

## 🔐 Authentication Flow

- **Local Login**: Username/password validated against bcrypt hashes in SQLite. On success the JWT is set as the httpOnly cookie `dim_session`, next to a readable flag cookie `dim_auth` without a secret (`services/SessionCookie.ts`). Both are `SameSite=Strict`, `Secure` when the request came in over HTTPS, and expire with the token. The token is never part of a response body or a URL.
- **Session transport**: `@fastify/cookie` parses the cookie, and `@fastify/jwt` is registered with `cookie: { cookieName: "dim_session" }`, so `request.jwtVerify()` accepts the cookie as well as an `Authorization: Bearer` header. The dashboard WebSocket reads the same cookie from the handshake.
- **OIDC Login**: Full PKCE flow — the backend generates the authorization URL, handles the callback, exchanges the code for tokens, fetches userinfo from the provider, and issues a local JWT in the same cookies as the local login before redirecting to `/`.
- **Agent Auth**: Agents connect via WebSocket using a permanent `authToken` (obtained during registration). The token is validated against the database and the source IP is checked against configured network rules.
- **First Run**: If no users exist, `AuthService.initializeAdmin()` creates an `admin` user with the default password `"admin"`. **This should be changed immediately after first login.**

---

## ⚙️ Configuration (`src/config/AppConfig.ts`)

The backend reads its configuration from `server/config.yaml` (and environment variables). The config is loaded at startup and written back when settings are updated via the API.

**Validated at startup.** After a missing `jwtSecret` has been generated, the whole file is checked against `AppConfigSchema` from `@dim/shared`, which also holds every default. An invalid value ends the start with exit code 1 and one fatal log line naming the field, for example:

```
Invalid config.yaml -- security.allowed_networks.0: Must be an IPv4 address or an IPv4 network in CIDR notation
```

Checked are types and value ranges: whole numbers and `true`/`false` in `settings` (as string or as plain YAML value), IPv4 addresses or networks in the `security` lists, `hsts` as a boolean, `logLevel` as a pino level, and — only while `oidc.enabled` is `true` — the OIDC URLs and credentials. The top level and `settings` stay loose: keys the schema does not know are kept, because the file is written back and would otherwise lose them. Defaults are written into the file only when a known `settings` key was missing, as before; a valid file is not rewritten on startup.

**Key configuration sections:**

| Section             | Description                                                       |
| :------------------ | :---------------------------------------------------------------- |
| `jwtSecret`         | Auto-generated on first run if not present.                       |
| `jwtExpiresIn`      | JWT session lifetime (e.g. `"24h"`). Defaults to `"12h"`; tokens always expire. Also enforced as `maxAge` on verification, so tokens issued without an expiry are retired by age. |
| `oidc`              | OIDC provider settings (`enabled`, `issuer`, `client_id`, etc.).  |
| `logLevel`          | pino level; `LOG_LEVEL` wins when set.                            |
| `port`              | Listen port (default `3000`); `DIM_SERVER_PORT` wins when set.    |
| `settings`          | Operator settings (stored as strings, defaults in `AppSettingsSchema`): `token_*`, `image_version_cache_*`, `image_update_check_interval_seconds`, `container_auto_update_*`, `notification_*`. See [Get Settings](api.md#get-settings). |
| `security.allowed_networks`  | IPv4 addresses or CIDR ranges permitted to connect as agents. The per-client address lives in `clients.inbound_allowed_ip` (migration 07), editable via `PUT /clients/:id`; network matching is `@dim/shared`'s `network.ts`, shared with the agent and the client editor. |
| `security.hsts`              | Send `Strict-Transport-Security` (default `false`). Read at startup. |

---

## 📦 Key Dependencies

| Package                | Version   | Purpose                          |
| :--------------------- | :-------- | :------------------------------- |
| `fastify`              | ^5.x      | HTTP framework                   |
| `@fastify/websocket`   | ^11.x     | WebSocket support                |
| `@fastify/jwt`         | ^10.x     | JWT middleware                   |
| `@fastify/cookie`      | ^11.x     | Session cookie parsing           |
| `@fastify/cors`        | ^11.x     | Registered with `origin: false` — no CORS headers (same-origin only) |
| `@fastify/static`      | ^10.x     | Frontend static file serving     |
| `@fastify/rate-limit`  | ^11.x     | Login rate limit (10 attempts / 15 min, no global limit) |
| `@fastify/helmet`      | ^13.x     | Security headers incl. Content-Security-Policy; HSTS only with `security.hsts` |
| `better-sqlite3`       | ^13.x     | Synchronous SQLite3              |
| `umzug`                | ^3.x      | Database migration management    |
| `bcryptjs`             | ^3.x      | Password hashing                 |
| `openid-client`        | ^6.x      | OIDC / PKCE client               |
| `node-cron`            | ^4.x      | Validating cron expressions — the server runs none; the schedulers use intervals |
| `yaml`                 | ^2.x      | Config file parsing              |
| `@dim/shared/node`     | workspace | Pino logger (`logger`, `loggerOptions`) and `ImageUpdateService`, shared with the agent — see [Logging](#-logging) |
