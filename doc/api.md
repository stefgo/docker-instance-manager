# 📚 API Documentation

**Base URL:** `/api` (REST endpoints use `/api/v1` prefix unless otherwise noted)

> **Note:** All API responses are JSON formatted. All protected endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.

> **Validation:** Every endpoint that takes a body or query parameters checks them against a Zod schema from `@dim/shared` before doing anything else. A request that does not match is answered with **`400`** and a single message that starts with the path of the first offending field, e.g. `{ "error": "entries.0.containerName: Too small: expected string to have >=1 characters" }`. Only the first problem is reported; fix it and the next request names the next one.

## 📖 Table of Contents

- [Authentication](#-authentication)
    - [Login](#login)
    - [OIDC Configuration](#oidc-configuration)
    - [OIDC Login](#oidc-login)
    - [OIDC Callback](#oidc-callback)
- [Users](#-users)
    - [List Users](#list-users)
    - [Create User](#create-user)
    - [Update User](#update-user)
    - [Delete User](#delete-user)
- [Clients](#-clients)
    - [List Clients](#list-clients)
    - [Create Outbound Client](#create-outbound-client)
    - [Update Client](#update-client)
    - [Delete Client](#delete-client)
- [Registration Tokens](#-registration-tokens)
    - [List Tokens](#list-tokens)
    - [Create Token](#create-token)
    - [Delete Token](#delete-token)
    - [Register Client (Public)](#register-client-public)
- [Docker](#-docker)
    - [Get Docker State](#get-docker-state)
    - [Send Docker Action](#send-docker-action)
    - [Refresh Docker State](#refresh-docker-state)
    - [Check Image Update](#check-image-update)
- [Settings & Maintenance](#-settings--maintenance)
    - [Get Settings](#get-settings)
    - [Update Settings](#update-settings)
    - [Run Invalid Token Cleanup](#run-invalid-token-cleanup)
    - [Run Image Version Cache Cleanup](#run-image-version-cache-cleanup)
- [Misc](#-misc)
    - [Health Check](#health-check)
- [WebSockets](#-websockets)
    - [Dashboard Connection](#dashboard-connection)
    - [Agent Connection](#agent-connection)
        - [Client -> Server Events](#client---server-events)
        - [Server -> Client Events](#server---client-events)

---

## 🔐 Authentication

### Login

`POST /api/login`

**Description:** Authenticates a user with local credentials and returns a JWT token.

#### Request Body

| Field      | Type   | Required | Description               |
| :--------- | :----- | :------- | :------------------------ |
| `username` | string | **Yes**  | The username of the user. |
| `password` | string | **Yes**  | The password of the user. |

**Example Request:**

```json
{
    "username": "admin",
    "password": "secretpassword"
}
```

#### Response

| Field   | Type   | Description                                              |
| :------ | :----- | :------------------------------------------------------- |
| `token` | string | A JWT token used for authenticating subsequent requests. |

**Example Response:**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

The token expires after `jwtExpiresIn` (default `12h`).

- **400** — `username` or `password` missing or empty. A malformed request is not a failed login.
- **401** — `Invalid credentials`: unknown user, wrong password, or an account without a local password (OIDC only). All three answer the same.

#### Rate Limit

At most **10 attempts per 15 minutes** per client IP, successful or not. Further attempts
are answered with `429 Too Many Requests` until the window has passed; the response carries
`x-ratelimit-*` and `retry-after` headers. No other endpoint is rate limited.

### OIDC Configuration

`GET /api/auth/config`

**Description:** Returns the public authentication configuration. Used by the frontend to determine whether to show local login, OIDC login, or both.

#### Response

| Field       | Type   | Description                                |
| :---------- | :----- | :----------------------------------------- |
| `type`      | string | `"local"`, `"oidc"`, or `"local,oidc"`.   |

### OIDC Login

`GET /api/auth/login`

**Description:** Redirects the user's browser to the OIDC provider's login page. Generates a PKCE code verifier/challenge and stores state for CSRF protection.

#### Response

- **302 Redirect:** Redirects to the OIDC provider.

### OIDC Callback

`GET /api/auth/callback`

**Description:** Handles the callback from the OIDC provider. Exchanges the authorization code for a local JWT session token.

#### Query Parameters

| Parameter | Type   | Required | Description                                           |
| :-------- | :----- | :------- | :---------------------------------------------------- |
| `code`    | string | **Yes**  | The authorization code returned by the OIDC provider. |
| `state`   | string | **Yes**  | The state parameter for CSRF protection.              |

#### Response

- **302 Redirect:** Redirects to the frontend application with a `token` query parameter on success.

---

## 👤 Users

### List Users

`GET /api/v1/users`

**Description:** Retrieves a list of all registered users.

#### Response (Array of User objects)

| Field          | Type   | Description                                             |
| :------------- | :----- | :------------------------------------------------------ |
| `id`           | number | The unique identifier of the user.                      |
| `username`     | string | The username.                                           |
| `auth_methods` | string | Comma-separated list of allowed authentication methods. |
| `created_at`   | string | ISO 8601 timestamp of creation.                         |
| `updated_at`   | string | ISO 8601 timestamp of last update.                      |

**Example Response:**

```json
[
    {
        "id": 1,
        "username": "admin",
        "auth_methods": "local",
        "created_at": "2024-01-01T10:00:00.000Z",
        "updated_at": "2024-01-01T10:00:00.000Z"
    }
]
```

### Create User

`POST /api/v1/users`

**Description:** Creates a new user.

#### Request Body

| Field          | Type   | Required      | Description                                               |
| :------------- | :----- | :------------ | :-------------------------------------------------------- |
| `username`     | string | **Yes**       | The desired username.                                     |
| `password`     | string | _Conditional_ | Required when `auth_methods` includes `"local"`.          |
| `auth_methods` | string | No            | Auth methods: `"local"`, `"oidc"`, or `"local,oidc"`. Defaults to `"local"`. Any other value is rejected with `400`. |

**Example Request:**

```json
{
    "username": "jdoe",
    "password": "password123",
    "auth_methods": "local,oidc"
}
```

#### Response

```json
{ "status": "created" }
```

- **400** — invalid body, or `auth_methods` includes `local` without a `password`.
- **409** — username already exists.

### Update User

`PUT /api/v1/users/:userId`

**Description:** Updates an existing user's password or authentication methods.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to update. |

#### Request Body

| Field          | Type   | Required | Description                                                     |
| :------------- | :----- | :------- | :-------------------------------------------------------------- |
| `password`     | string | No       | The new password. Only valid if user has `"local"` auth method. |
| `auth_methods` | string | No       | New comma-separated list of `local` and `oidc`. An empty string leaves the methods unchanged. |

#### Response

```json
{ "status": "updated" }
```

### Delete User

`DELETE /api/v1/users/:userId`

**Description:** Deletes a user. Cannot delete yourself or the last remaining user.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to delete. |

#### Response

```json
{ "status": "deleted" }
```

---

## 🖥️ Clients

### List Clients

`GET /api/v1/clients`

**Description:** Retrieves a list of all registered clients enriched with their live connection status from `ProxyService`.

#### Response (Array of Client objects)

| Field         | Type           | Description                                              |
| :------------ | :------------- | :------------------------------------------------------- |
| `id`          | string         | Client UUID.                                             |
| `hostname`    | string         | Hostname of the client machine.                          |
| `displayName` | string \| null | Optional human-readable name.                            |
| `status`      | string         | `"online"` or `"offline"`.                               |
| `lastSeen`    | string \| null | ISO 8601 timestamp of last connection.                   |
| `version`     | string \| null | Agent version reported on last connection.               |
| `connectionMode` | string      | `"inbound"` (agent dials in) or `"outbound"` (server dials the agent). |
| `inboundAllowedIp` | string \| null | Inbound clients: the address or IPv4 network connections must come from; `null` when the check is switched off. |
| `outboundTargetAddress` | string \| null | Outbound clients: `host:port` the server dials. |

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "backup-client-01",
        "displayName": "Backup Client",
        "status": "online",
        "lastSeen": "2024-01-01T12:30:00.000Z",
        "version": "1.0.0"
    }
]
```

### Create Outbound Client

`POST /api/v1/clients/outbound`

**Description:** Adds a client that the **server** connects to (outbound mode), instead of the agent dialling in. The server opens `ws://<outboundTargetAddress>/ws/register`, hands over the registration secret together with a newly generated auth token and the client's server-issued `clientId` (stored by the agent in its `config.yaml`), and then opens the regular agent session on `/ws/agent`. The client is written to the database only after that session has authenticated.

#### Request Body

| Field                   | Type   | Required | Description                                                          |
| :---------------------- | :----- | :------- | :------------------------------------------------------------------- |
| `outboundTargetAddress` | string | **Yes**  | `host:port` of the agent's web server (default port `3001`).         |
| `registrationSecret`    | string | **Yes**  | Must match `registrationSecret` in the agent's `config.yaml`.        |
| `hostname`              | string | No       | Name shown for the client. Defaults to `outboundTargetAddress`.      |

#### Response

```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "hostname": "docker-host-01" }
```

An empty `outboundTargetAddress` or `registrationSecret` is answered with `400` before any connection is attempted. On a failed handshake the endpoint answers `503` with `{ "error": "Could not establish connection to client. <reason>" }`. The reason is derived from how the agent ended the handshake, and the request returns as soon as the agent closes the connection:

| Agent response                                   | Reason given                                                                 |
| :----------------------------------------------- | :--------------------------------------------------------------------------- |
| Close `4003 Already registered`                  | The agent already holds an `authToken`; remove it and set a new secret.      |
| Close `4003 No registration secret configured`   | `registrationSecret` is missing in the agent's `config.yaml`.                |
| `REGISTRATION_FAILURE` / close `4003 Invalid secret` | The secret does not match.                                               |
| Close `4001 Registration timed out`              | The agent gave up waiting for the registration request.                      |
| Connection error / no answer within 10 s         | The underlying error, or a timeout message.                                  |
| Registration succeeded, AUTH failed              | The agent has already stored its token; it must be reset before retrying.   |

### Update Client

`PUT /api/v1/clients/:clientId`

**Description:** Updates a client's display name and, for inbound clients, the address its connections must come from. At least one field is required.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field         | Type   | Required | Description                         |
| :------------ | :----- | :------- | :---------------------------------- |
| `displayName` | string | No       | The new display name for the client. |
| `inboundAllowedIp` | string \| null | No | Inbound clients only. An IPv4 address or CIDR network restricts connections to it; `null` switches the check off; leaving the field out keeps the stored value. |

#### Response

```json
{ "success": true }
```

- **400** — neither field given, `inboundAllowedIp` not an IPv4 address or network, or `inboundAllowedIp` sent for an outbound client.
- **404** — client not found.

### Delete Client

`DELETE /api/v1/clients/:clientId`

**Description:** Removes a client registration. If the client is currently connected, its WebSocket connection is terminated.

#### Path Parameters

| Parameter  | Type   | Required | Description                       |
| :--------- | :----- | :------- | :-------------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client to delete. |

#### Response

```json
{ "status": "deleted" }
```

---

## 🎫 Registration Tokens

### List Tokens

`GET /api/v1/tokens`

**Description:** Lists all registration tokens including used and expired ones.

#### Response (Array of Token objects)

| Field        | Type           | Description                                     |
| :----------- | :------------- | :---------------------------------------------- |
| `token`      | string         | The token string.                               |
| `created_at` | string         | ISO 8601 creation timestamp.                    |
| `expires_at` | string         | ISO 8601 expiry timestamp (30 min from creation). |
| `used_at`    | string \| null | ISO 8601 timestamp when a client registered with this token. |

**Example Response:**

```json
[
    {
        "token": "a1b2c3d4e5f6...",
        "created_at": "2024-01-01T10:00:00.000Z",
        "expires_at": "2024-01-01T10:30:00.000Z",
        "used_at": null
    }
]
```

### Create Token

`POST /api/v1/tokens`

**Description:** Generates a new short-lived registration token (valid for 30 minutes).

#### Response

```json
{
    "token": "a1b2c3d4e5...",
    "expiresAt": "2024-01-01T10:30:00.000Z"
}
```

### Delete Token

`DELETE /api/v1/tokens/:token`

**Description:** Manually invalidates and deletes a registration token.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| :-------- | :----- | :------- | :-------------------------- |
| `token`   | string | **Yes**  | The token string to delete. |

#### Response

```json
{ "status": "deleted" }
```

### Register Client (Public)

`POST /api/v1/register`

**Description:** Public endpoint used by the client agent to register itself using a valid token. Returns the client's identity: a `clientId` and a permanent `authToken` for subsequent WebSocket connections. Both are issued by the **server**; every successful call creates a new client.

#### Request Body

| Field      | Type   | Required | Description                                     |
| :--------- | :----- | :------- | :---------------------------------------------- |
| `token`    | string | **Yes**  | A valid, unused, and non-expired registration token. |
| `hostname` | string | No       | Hostname of the client device.                  |

A body without a `token` is answered with `400`, before the token is looked up. An unknown, used or expired token gets `403`.

A `clientId` in the body, as sent by older agents, is ignored. It used to be taken over and
upserted, which let anyone holding a registration token name an existing client and replace its
auth token.

**Example Request:**

```json
{
    "token": "a1b2c3d4e5...",
    "hostname": "docker-host-01"
}
```

#### Response

```json
{
    "token": "f8a9b2...",
    "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

> The returned `token` is the permanent `authToken` and `clientId` the id the server knows the client by. The agent saves both in its `config.yaml`; the `token` is used for all future WebSocket connections.
>
> Registering an agent again creates a **new** client entry; the previous one stays behind offline and can be deleted in the UI.

---

## 🐳 Docker

### Get Docker State

`GET /api/v1/clients/:clientId/docker`

**Description:** Returns the most recent Docker state snapshot stored for a client (containers, images, volumes, networks). The state is persisted each time an agent pushes a `DOCKER_UPDATE` message.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

```json
{
    "containers": [ /* DockerContainer[] */ ],
    "images":     [ /* DockerImage[] */ ],
    "volumes":    [ /* DockerVolume[] */ ],
    "networks":   [ /* DockerNetwork[] */ ],
    "updatedAt":  "2024-01-01T12:30:00.000Z"
}
```

- **404** if no state has been received yet for this client.

### Send Docker Action

`POST /api/v1/clients/:clientId/docker/action`

**Description:** Forwards a Docker action to the connected client agent and waits for the `DOCKER_ACTION_RESULT`. Used by the dashboard to start/stop/remove containers, pull/update/remove/prune images, and remove volumes/networks.

#### Request Body

| Field    | Type   | Required | Description                                                                                             |
| :------- | :----- | :------- | :------------------------------------------------------------------------------------------------------ |
| `action` | string | **Yes**  | One of the `DOCKER_ACTION_TYPES` (see below).                                                           |
| `target` | string | **Yes**  | Target identifier (container ID, image ref, volume name, network ID). Optional for `image:prune`.       |
| `params` | object | No       | Action-specific parameters.                                                                             |

**Supported actions:**

`container:start`, `container:stop`, `container:restart`, `container:remove`, `container:pause`, `container:unpause`, `container:recreate`, `image:remove`, `image:pull`, `image:update`, `image:prune`, `volume:remove`, `network:remove`.

#### Response

```json
{ "actionId": "…", "success": true }
```

- **400** — `action` not in the list above, `target` missing for anything but `image:prune`, or `params` not an object. Checked before the agent is contacted: whatever passes goes to that host's Docker socket.
- **503** — client is not connected.
- **504** — client did not respond within the action timeout (120 s).

> On a successful `image:pull` or `image:update`, the backend automatically re-runs an `ImageUpdateService.checkForUpdate` against the pulled `target` and updates the cached digest.

### Refresh Docker State

`POST /api/v1/clients/:clientId/docker/refresh`

**Description:** Asks a connected client agent (fire-and-forget) to re-scan its Docker daemon and push a fresh `DOCKER_UPDATE`.

#### Response

```json
{ "status": "refresh requested" }
```

- **202** — request forwarded to the agent.
- **503** — client is not connected.

### Check Image Update

`GET /api/v1/docker/images/check-update`

**Description:** Checks the configured image registry for a newer manifest digest of the given image tag. Supports Docker Hub, `ghcr.io`, and `lscr.io`. Caches the result in `image_update_checks`.

#### Query Parameters

| Parameter     | Type   | Required | Description                                                                                      |
| :------------ | :----- | :------- | :----------------------------------------------------------------------------------------------- |
| `repoTag`     | string | **Yes**  | Image reference as stored in `repoTags` (e.g. `nginx:latest`).                                   |
| `repoDigests` | string | No       | Comma-separated `repoDigests` from the local image, used to determine whether an update exists.  |

#### Response

```json
{
    "repoTag": "nginx:latest",
    "localDigest": "sha256:…",
    "remoteDigest": "sha256:…",
    "hasUpdate": true
}
```

`error` is returned instead when the remote digest cannot be fetched. A request without `repoTag` gets `400`.

---

## 🛠️ Settings & Maintenance

### Get Settings

`GET /api/v1/settings/cleanup`

**Description:** Retrieves the `settings` block of `config.yaml`. All setting values are returned as strings. The `security` block is not part of the response: it is configured in `config.yaml` only.

#### Response

```json
{
    "retention_invalid_tokens_days": "30",
    "retention_invalid_tokens_count": "10",
    "image_version_cache_ttl_days": "30",
    "image_version_cache_cleanup_orphans": "true",
    "image_version_cache_cleanup_interval_hours": "24"
}
```

| Setting                                      | Description                                                                   |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| `retention_invalid_tokens_days`              | Days to retain used/expired registration tokens before they become eligible for deletion. `"0"` deletes immediately. |
| `retention_invalid_tokens_count`             | Minimum number of most-recent invalid tokens to always keep (audit trail).    |
| `image_version_cache_ttl_days`               | Max age of a cached `image_update_checks` row (measured against `checked_at`). `"0"` disables TTL cleanup. |
| `image_version_cache_cleanup_orphans`        | `"true"`/`"false"` — also remove cache rows whose `image_ref` is no longer referenced by any client state. |
| `image_version_cache_cleanup_interval_hours` | Interval of the automatic cache cleanup scheduler. `"0"` disables the scheduler. |

### Update Settings

`PUT /api/v1/settings/cleanup`

**Description:** Updates settings. All fields are optional; only provided fields are updated.

#### Request Body

Pass any of the setting keys to update them.

```json
{
    "retention_invalid_tokens_days": "60",
    "image_version_cache_ttl_days": "60"
}
```

| Kind of setting | Keys | Accepted values |
| :-------------- | :--- | :-------------- |
| Counts, days, intervals | `retention_invalid_tokens_*`, `image_version_cache_ttl_days`, `image_version_cache_cleanup_interval_hours`, `image_update_check_interval_seconds`, `notification_*` | A non-negative whole number, as string or number. Stored as string. |
| Switches | `image_version_cache_cleanup_orphans`, `container_auto_update_refresh_check` | `"true"`, `"false"` or a boolean. Stored as string. |
| Cron | `container_auto_update_cron` | Empty, or a valid cron expression. |
| Labels | `container_auto_update_label`, `container_auto_update_delay_label` | Any string. |

Keys not listed are accepted and written as they are: the settings page sends back everything it read, including keys an operator added to `config.yaml` by hand, and rejecting or dropping them would delete them from the file.

#### Response

```json
{ "success": true }
```

- **400** — a value does not match the table above, or the body contains `security`. Network and HSTS settings are configured in `config.yaml` only; a session token must not be enough to lock every agent out.

> Changing any `image_version_cache_*` key automatically restarts the `ImageUpdateCacheCleanupService` scheduler.

### Run Invalid Token Cleanup

`POST /api/v1/settings/cleanup/invalid-tokens`

**Description:** Runs `TokenCleanupService` synchronously, removing used/expired registration tokens older than `retention_invalid_tokens_days` while keeping at least `retention_invalid_tokens_count` of the most-recent ones.

#### Response

```json
{ "success": true, "removed": 4 }
```

### Run Image Version Cache Cleanup

`POST /api/v1/settings/cleanup/image-version-cache`

**Description:** Runs `ImageUpdateCacheCleanupService` synchronously. Removes orphaned `image_update_checks` rows (if enabled) and expired rows (if `image_version_cache_ttl_days > 0`).

#### Response

```json
{ "success": true, "orphansRemoved": 2, "expiredRemoved": 7 }
```

---

### Scheduler Status

`GET /api/v1/settings/scheduler-status`

**Description:** Returns the current status of all background schedulers.

#### Response

```json
{
    "imageUpdateCheck": {
        "lastRun": "2026-04-18T10:00:00.000Z",
        "nextRun": "2026-04-18T11:00:00.000Z",
        "isRunning": false
    },
    "containerAutoUpdate": {
        "lastRun": null,
        "nextRun": null,
        "isRunning": false,
        "cronExpression": "0 3 * * *"
    }
}
```

---

### Run Image Update Check Now

`POST /api/v1/settings/image-update-check/run`

**Description:** Triggers a full image update check sweep synchronously. Every known image tag is checked against its registry and the result is written to `image_update_checks`.

#### Response

```json
{ "success": true, "checked": 42 }
```

---

### Container Auto-Update

Containers are eligible for automatic updates if they either carry the configured Docker label (`container_auto_update_label`), or are manually enrolled via the endpoints below. Only containers whose image has a confirmed update (`hasUpdate === true`) are actually updated.

**Related settings:**

| Key                                     | Description                                                                                   |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------- |
| `container_auto_update_cron`            | Cron expression for the scheduler. Empty string disables automatic runs.                      |
| `container_auto_update_label`           | Docker label marking a container for auto-update. Format `key=value` or `key` (any value).   |
| `container_auto_update_refresh_check`   | `"true"`/`"false"` — re-check each image against the registry before updating.               |

> Changing `container_auto_update_cron` automatically restarts the `ContainerAutoUpdateSchedulerService`.

#### Run Now

`POST /api/v1/settings/container-auto-update/run`

**Description:** Runs the auto-update sweep immediately.

**Response:**

```json
{ "success": true, "eligible": 5, "updated": 2, "skippedNoUpdate": 2, "skippedOffline": 1, "failed": 0 }
```

#### Validate Cron

`POST /api/v1/settings/container-auto-update/validate-cron`

**Request:**

```json
{ "expr": "0 3 * * *" }
```

**Response:**

```json
{ "valid": true }
```

A body without a string `expr` gets `400`.

#### List Eligible Containers

`GET /api/v1/settings/container-auto-update/eligible`

**Description:** Returns the combined set of label-matched and manually enrolled containers.

**Response:**

```json
{
    "containers": [
        {
            "clientId": "…",
            "containerId": "…",
            "name": "nginx",
            "image": "nginx:latest",
            "source": "label"
        }
    ]
}
```

#### Manual Container Enrollment

Manual auto-update enrollment lives under the container namespace and supports
batch operations so a parent row in the Container management UI can toggle all
its child instances in one request.

`GET /api/v1/containers/auto-update/manual` — list enrolled entries.

**Response:**

```json
{
    "entries": [
        { "containerName": "nginx", "clientId": "…", "addedAt": "2026-04-19T10:00:00.000Z" }
    ],
    "labelFilter": "dim.auto-update=true"
}
```

`POST /api/v1/containers/auto-update/manual` — batch enroll.

**Request:**

```json
{ "entries": [{ "containerName": "nginx", "clientId": "…" }] }
```

`DELETE /api/v1/containers/auto-update/manual` — batch remove.

**Request:**

```json
{ "entries": [{ "containerName": "nginx", "clientId": "…" }] }
```

`containerName` is required and must not be empty; an empty or missing `clientId` addresses the container name on every client. `entries` must hold at least one entry. An invalid entry rejects the whole request with `400` — it used to be dropped silently, so a request with a typo succeeded and changed nothing.

Both mutating endpoints broadcast a `MANUAL_AUTO_UPDATE_UPDATE` WS event with
the updated entry list and current label filter.

---

## 🏓 Misc

### Health Check

`GET /api/v1/ping`

**Description:** Public health check endpoint. Used by client agents to verify server reachability before registration.

#### Response

```json
{ "status": "ok" }
```

---

## 🔌 WebSockets

### Dashboard Connection

`GET /ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time client status updates.

#### Query Parameters

| Parameter | Type   | Required | Description                     |
| :-------- | :----- | :------- | :------------------------------ |
| `token`   | string | **Yes**  | Valid JWT authentication token. |

#### Behavior

- On connect: The server immediately sends a `CLIENTS_UPDATE` event with the full current client list.
- A ping/pong heartbeat runs every 30 seconds to detect dead connections.
- All broadcasts from `ProxyService` (e.g., agent connects/disconnects) are forwarded to all active dashboard sessions.

#### Events (Server -> Client)

| Event                 | Payload                                     | Description                                                       |
| :-------------------- | :------------------------------------------ | :---------------------------------------------------------------- |
| `CLIENTS_UPDATE`      | `Client[]`                                  | Full list of all clients and their statuses.                      |
| `DOCKER_STATE_UPDATE` | `{ clientId, state: DockerState }`          | Docker state snapshot pushed by an agent, rebroadcast to dashboards. |
| `DOCKER_ACTION_RESULT`| `{ clientId, result: DockerActionResult }`  | Result of a previously dispatched Docker action.                  |
| `SCHEDULER_STATUS_UPDATE` | `{ imageUpdateCheck?, containerAutoUpdate? }` | Partial scheduler status change. Each scheduler broadcasts only its own key. |
| `MANUAL_AUTO_UPDATE_UPDATE` | `{ entries: ManualAutoUpdateEntry[], labelFilter: string }` | Manual auto-update enrollment list or auto-update label setting changed. |

---

### Agent Connection

`GET /ws/agent`

**Description:** WebSocket endpoint for client agents. Requires a valid `authToken` obtained during registration.

#### Query Parameters

| Parameter | Type   | Required | Description                                              |
| :-------- | :----- | :------- | :------------------------------------------------------- |
| `token`   | string | **Yes**  | The permanent `authToken` from the client's `config.yaml`. |

#### Authentication Stages

1. Token is looked up in the database (`4003 Invalid credentials` if unknown).
2. Client's IP is checked against `security.allowed_networks` (`4003 Access denied`).
3. A token that belongs to an **outbound** client is refused (`4003 Access denied`): those are dialled by the server and never connect here.
4. Client's IP is checked against the client's allowed address or network; a client whose check is switched off skips this step (`4003 IP address mismatch`).
5. A 5-second window is given for the client to send an `AUTH` handshake message.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake, sent immediately after connection.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0"
}
```

**`DOCKER_UPDATE`**
**Description:** Full Docker state snapshot (containers, images, volumes, networks). Sent after connect, on relevant Docker events, and on `REQUEST_STATE_UPDATE`.
**Payload:** `DockerState` without `updatedAt` (the server stamps it on persist).

**`DOCKER_ACTION_RESULT`**
**Description:** Response to a server-dispatched `DOCKER_ACTION`. Resolves the backend's pending promise and is rebroadcast to dashboards.
**Payload:**

```json
{ "actionId": "…", "success": true, "error": "…" }
```

#### Server -> Client Events

**`AUTH_SUCCESS`**
**Payload:**

```json
{
    "lastSyncTime": "2024-01-01T12:00:00.000Z"
}
```

**`AUTH_FAILURE`**
**Payload:**

```json
{
    "error": "Reason for failure"
}
```

**`DOCKER_ACTION`**
**Description:** Instructs the agent to run a Docker action (start/stop/pull/update/prune/remove/...). Fire-and-forget; the agent answers with `DOCKER_ACTION_RESULT`.
**Payload:**

```json
{
    "actionId": "…",
    "action": "container:start",
    "target": "<container-id | image-ref | volume | network>",
    "params": { }
}
```

**`REQUEST_STATE_UPDATE`**
**Description:** Asks the agent to immediately emit a fresh `DOCKER_UPDATE`.
**Payload:** `{}`

> After a successful `AUTH` / `AUTH_SUCCESS` exchange, the server registers the client in `ProxyService` and broadcasts a `CLIENTS_UPDATE` to all connected dashboards.
