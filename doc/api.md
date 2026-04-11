# 📚 API Documentation

**Base URL:** `/api` (REST endpoints use `/api/v1` prefix unless otherwise noted)

> **Note:** All API responses are JSON formatted. All protected endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.

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
| `auth_methods` | string | No            | Auth methods: `"local"`, `"oidc"`, or `"local,oidc"`. Defaults to `"local"`. |

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
| `auth_methods` | string | No       | New comma-separated list of authentication methods.             |

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

### Update Client

`PUT /api/v1/clients/:clientId`

**Description:** Updates a client's display name.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field         | Type   | Required | Description                         |
| :------------ | :----- | :------- | :---------------------------------- |
| `displayName` | string | **Yes**  | The new display name for the client. |

#### Response

```json
{ "status": "updated" }
```

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

**Description:** Public endpoint used by the client agent to register itself using a valid token. Returns a permanent `authToken` for subsequent WebSocket connections.

#### Request Body

| Field      | Type   | Required | Description                                     |
| :--------- | :----- | :------- | :---------------------------------------------- |
| `token`    | string | **Yes**  | A valid, unused, and non-expired registration token. |
| `clientId` | string | **Yes**  | UUID generated by the client for its identity.  |
| `hostname` | string | No       | Hostname of the client device.                  |

**Example Request:**

```json
{
    "token": "a1b2c3d4e5...",
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "hostname": "backup-client-01"
}
```

#### Response

```json
{
    "token": "f8a9b2...",
    "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

> The returned `token` is the permanent `authToken` saved in the client's `config.yaml` and used for all future WebSocket connections.

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

- **400** — invalid/missing action or target.
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

`error` is returned instead when the remote digest cannot be fetched.

---

## 🛠️ Settings & Maintenance

### Get Settings

`GET /api/v1/settings/cleanup`

**Description:** Retrieves current retention/cache settings and network security configuration. All setting values are stored as strings.

#### Response

```json
{
    "retention_invalid_tokens_days": "30",
    "retention_invalid_tokens_count": "10",
    "image_version_cache_ttl_days": "30",
    "image_version_cache_cleanup_orphans": "true",
    "image_version_cache_cleanup_interval_hours": "24",
    "security": {
        "allowed_networks": [],
        "trusted_networks": []
    }
}
```

| Setting                                      | Description                                                                   |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| `retention_invalid_tokens_days`              | Days to retain used/expired registration tokens before they become eligible for deletion. `"0"` deletes immediately. |
| `retention_invalid_tokens_count`             | Minimum number of most-recent invalid tokens to always keep (audit trail).    |
| `image_version_cache_ttl_days`               | Max age of a cached `image_update_checks` row (measured against `checked_at`). `"0"` disables TTL cleanup. |
| `image_version_cache_cleanup_orphans`        | `"true"`/`"false"` — also remove cache rows whose `image_ref` is no longer referenced by any client state. |
| `image_version_cache_cleanup_interval_hours` | Interval of the automatic cache cleanup scheduler. `"0"` disables the scheduler. |
| `security.allowed_networks`                  | CIDR ranges allowed to connect as agents (global whitelist).                  |
| `security.trusted_networks`                  | CIDR ranges exempt from per-client IP validation.                             |

### Update Settings

`PUT /api/v1/settings/cleanup`

**Description:** Updates retention settings and/or security configuration. All fields are optional; only provided fields are updated.

#### Request Body

Pass any of the top-level setting keys to update them. Pass a nested `security` object to replace the network lists.

```json
{
    "retention_invalid_tokens_days": "60",
    "image_version_cache_ttl_days": "60",
    "security": {
        "allowed_networks": ["10.0.0.0/8"],
        "trusted_networks": ["127.0.0.1/32", "192.168.1.0/24"]
    }
}
```

#### Response

```json
{ "success": true }
```

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

---

### Agent Connection

`GET /ws/agent`

**Description:** WebSocket endpoint for client agents. Requires a valid `authToken` obtained during registration.

#### Query Parameters

| Parameter | Type   | Required | Description                                              |
| :-------- | :----- | :------- | :------------------------------------------------------- |
| `token`   | string | **Yes**  | The permanent `authToken` from the client's `config.yaml`. |

#### Authentication Stages

1. Token is looked up in the database.
2. Client's IP is checked against `allowed_networks` (global whitelist).
3. Client's IP is checked against `trusted_networks`; if not trusted, the IP must match the original registration IP.
4. A 5-second window is given for the client to send an `AUTH` handshake message.

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
