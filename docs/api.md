# 📚 API Documentation

**Base URL:** `/api` (REST endpoints use `/api/v1` prefix unless otherwise noted)

> **Note:** All API responses are JSON formatted. All protected endpoints require a valid session: the `dim_session` cookie set by the login, or the same JWT in an `Authorization: Bearer <token>` header.

> **Validation:** Every endpoint that takes a body or query parameters checks them against a Zod schema from `@dim/shared` before doing anything else. A request that does not match is answered with **`400`** and a single message that starts with the path of the first offending field, e.g. `{ "error": "entries.0.containerName: Too small: expected string to have >=1 characters" }`. Only the first problem is reported; fix it and the next request names the next one.

## 📖 Table of Contents

- [Authentication](#-authentication)
    - [Login](#login)
    - [Logout](#logout)
    - [Current Session](#current-session)
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
    - [Reconnect An Outbound Client](#reconnect-an-outbound-client)
    - [Run Auto-Update On One Client](#run-auto-update-on-one-client)
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
    - [Run Activity Cleanup](#run-activity-cleanup)
    - [Scheduler Status](#scheduler-status)
    - [Run Image Update Check Now](#run-image-update-check-now)
    - [Container Auto-Update](#container-auto-update)
- [Projects](#-projects)
    - [List Projects](#list-projects)
    - [Preview a Query](#preview-a-query)
    - [Create Project](#create-project)
    - [Update Project](#update-project)
    - [Delete Project](#delete-project)
- [Activity](#-activity)
    - [List Activity](#list-activity)
    - [Mark Seen](#mark-seen)
    - [Delete Activity](#delete-activity)
- [Misc](#-misc)
    - [Health](#health)
    - [Reachability](#reachability)
- [WebSockets](#-websockets)
    - [Dashboard Connection](#dashboard-connection)
    - [Agent Connection](#agent-connection)
        - [Client -> Server Events](#client---server-events)
        - [Server -> Client Events](#server---client-events)

---

## 🔐 Authentication

### Login

`POST /api/login`

**Description:** Authenticates a user with local credentials and starts a session. The session token is set as a cookie and is not part of the response body.

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

```json
{
    "success": true
}
```

The response sets two cookies, both with `Path=/`, `SameSite=Strict` and a `Max-Age` that ends when the token does (`jwtExpiresIn`, default `12h`). `Secure` is added when the request came in over HTTPS (behind a reverse proxy: `X-Forwarded-Proto: https`).

| Cookie        | `HttpOnly` | Content                                                                 |
| :------------ | :--------- | :---------------------------------------------------------------------- |
| `dim_session` | yes        | The JWT. Sent by the browser on every request and on the WebSocket handshake. |
| `dim_auth`    | no         | `1`. Carries no secret; tells the dashboard that a session exists.      |

Every protected endpoint accepts the session either as the `dim_session` cookie or as `Authorization: Bearer <token>`. A script can log in with this endpoint and send the value of `dim_session` as a bearer token.

- **400** — `username` or `password` missing or empty. A malformed request is not a failed login.
- **401** — `Invalid credentials`: unknown user, wrong password, or an account without a local password (OIDC only). All three answer the same.

#### Rate Limit

At most **10 attempts per 15 minutes** per client IP, successful or not. Further attempts
are answered with `429 Too Many Requests` until the window has passed; the response carries
`x-ratelimit-*` and `retry-after` headers. No other endpoint is rate limited.

### Logout

`POST /api/auth/logout`

**Description:** Ends the browser session by clearing both cookies. Unauthenticated, so that an expired session can be logged out of too. The token itself stays valid until it expires; the server keeps no session list to revoke it from.

#### Response

```json
{
    "success": true
}
```

### Current Session

`GET /api/v1/me`

**Description:** Who the current session belongs to and when it expires. The dashboard reads the username, the user id and the expiry (for its automatic logout) from here, because it cannot read the httpOnly cookie. Protected like every `/api/v1` endpoint: without a valid session it answers `401`.

#### Response

| Field       | Type           | Description                                   |
| :---------- | :------------- | :-------------------------------------------- |
| `id`        | number         | The user's id.                                |
| `username`  | string         | The user's name.                              |
| `expiresAt` | string \| null | ISO 8601 time at which the session expires. |

```json
{
    "id": 1,
    "username": "admin",
    "expiresAt": "2026-09-12T06:00:00.000Z"
}
```

### OIDC Configuration

`GET /api/auth/config`

**Description:** Returns the public authentication configuration. Used by the frontend to determine whether to show local login, OIDC login, or both.

#### Response

| Field       | Type   | Description                                |
| :---------- | :----- | :----------------------------------------- |
| `type`      | string | `"oidc"` while an OIDC provider is configured and was discovered at startup, otherwise `"local"`. Local login stays available either way. |

### OIDC Login

`GET /api/auth/login`

**Description:** Redirects the user's browser to the OIDC provider's login page. Generates a PKCE code verifier/challenge and stores state for CSRF protection.

#### Response

- **302 Redirect:** Redirects to the OIDC provider.
- **404** — OIDC is not configured.

### OIDC Callback

`GET /api/auth/callback`

**Description:** Handles the callback from the OIDC provider. Exchanges the authorization code for a local JWT session token.

#### Query Parameters

| Parameter | Type   | Required | Description                                           |
| :-------- | :----- | :------- | :---------------------------------------------------- |
| `code`    | string | **Yes**  | The authorization code returned by the OIDC provider. |
| `state`   | string | **Yes**  | The state parameter for CSRF protection.              |

#### Response

- **302 Redirect:** Sets the session cookies (see [Login](#login)) and redirects to `/`. The token is not put into the redirect URL.
- **500** — `Authentication failed: <reason>`: OIDC is disabled, the state does not match, or the code exchange failed.

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

- **400** — invalid body, a `password` for a user without `local`, or `local` for a user who has no password and gets none.
- **404** — user not found.

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

- **400** — `Cannot delete yourself` or `Cannot delete the last user`.
- **404** — user not found.

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
| `inboundLastIp` | string \| null | Inbound clients: the address the agent last authenticated from. Read-only and written only after the check above has passed, so it is always an address that was let in. The client editor measures a new `inboundAllowedIp` against it and warns before a value is saved that would refuse the agent. `null` until the agent has connected once. |
| `outboundTargetAddress` | string \| null | Outbound clients: `host:port` the server dials. |
| `autoUpdateCron` | string \| null | This host's auto-update schedule for containers outside any project. `null` inherits the default from the settings, `""` means the host takes part through its projects only. |
| `capabilities` | string[] \| null | What the agent currently connected says it can do, as it named it in its `AUTH` payload (see below). `null` while the client is offline — capabilities belong to the build on the wire, not to the stored client; `[]` is a connected agent that names none. An agent that lacks a capability is still fully manageable, which is what makes updating it possible. |
| `createdAt`   | string         | When the client was registered.                          |
| `updatedAt`   | string \| null | When the stored record last changed.                     |

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "backup-client-01",
        "displayName": "Backup Client",
        "status": "online",
        "lastSeen": "2024-01-01T12:30:00.000Z",
        "version": "1.0.0",
        "connectionMode": "inbound",
        "inboundAllowedIp": "192.168.1.50",
        "inboundLastIp": "192.168.1.50",
        "outboundTargetAddress": null,
        "autoUpdateCron": null,
        "capabilities": ["auto-update", "project-query"],
        "createdAt": "2024-01-01 10:00:00",
        "updatedAt": "2024-01-01 12:30:00"
    }
]
```

### Create Outbound Client

`POST /api/v1/clients/outbound`

**Description:** Adds a client that the **server** connects to (outbound mode), instead of the agent dialling in. The server opens `<scheme>://<outboundTargetAddress>/ws/register` — `wss://` when the stored address carries that prefix, `ws://` otherwise — hands over the agent's setup PIN (or its `DIM_REGISTRATION_SECRET`) together with a newly generated auth token and the client's server-issued `clientId` (stored by the agent in `identity.json` in its data directory), and then opens the regular agent session on `/ws/agent`, presenting both halves of that identity in the query string — the agent refuses a caller that does not name the id it was registered under. The client is written to the database only after that session has authenticated.

#### Request Body

| Field                   | Type   | Required | Description                                                          |
| :---------------------- | :----- | :------- | :------------------------------------------------------------------- |
| `outboundTargetAddress` | string | **Yes**  | `host`, `host:port` or `wss://host:port` of the agent's web server. Without a port, `:3001` is appended. `wss://` dials the agent over TLS, which requires the agent to serve it (see [client.md](client.md)); a bare address, or one written `ws://`, is stored and dialled as plaintext. Any other scheme, and a path, query or credentials, are refused — the value is interpolated into a WebSocket URL. |
| `registrationSecret`    | string | **Yes**  | The setup PIN from the agent's log, or the value of `DIM_REGISTRATION_SECRET` if the agent has one. The agent tells the two apart. |
| `hostname`              | string | No       | Name shown for the client. Defaults to `outboundTargetAddress`.      |

#### Response

```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "hostname": "docker-host-01" }
```

An empty `outboundTargetAddress` or `registrationSecret` is answered with `400` before any connection is attempted. On a failed handshake the endpoint answers `503` with `{ "error": "Could not establish connection to client. <reason>" }`. The reason is derived from how the agent ended the handshake, and the request returns as soon as the agent closes the connection:

| Agent response                                   | Reason given                                                                 |
| :----------------------------------------------- | :--------------------------------------------------------------------------- |
| Close `4003 Already registered`                  | The agent already holds an identity; remove its `identity.json`, restart it and use the new setup PIN. |
| Close `4003 No registration secret configured`   | Only from agents older than the setup PIN: they need `registrationSecret` in their `config.yaml`. |
| `REGISTRATION_FAILURE` / close `4003 Invalid secret` | Neither the setup PIN nor the secret matches. After 5 wrong attempts the agent logs a new PIN. |
| Close `4001 Registration timed out`              | The agent gave up waiting for the registration request.                      |
| Connection error / no answer within 10 s         | The underlying error, or a timeout message.                                  |
| Registration succeeded, AUTH failed              | The agent has already stored its token; it must be reset before retrying.   |

### Update Client

`PUT /api/v1/clients/:clientId`

**Description:** Updates a client's display name, its auto-update schedule, for inbound clients the address its connections must come from, and for outbound clients the address the server dials. At least one field is required.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field         | Type   | Required | Description                         |
| :------------ | :----- | :------- | :---------------------------------- |
| `displayName` | string | No       | The new display name for the client. |
| `inboundAllowedIp` | string \| null | No | Inbound clients only. An IPv4 address or CIDR network restricts connections to it; `null` switches the check off; leaving the field out keeps the stored value. |
| `outboundTargetAddress` | string | No | Outbound clients only. `host` or `host:port` the server dials; without a port, `:3001` is appended. Same rule as on `POST /clients/outbound`. |
| `autoUpdateCron` | string \| null | No | This host's auto-update schedule for containers that belong to no project. An expression sets it, `null` goes back to the default from the settings, `""` means the host takes part through its projects only, and leaving the field out keeps the stored value. Reaches the agent as part of its policy the moment it is saved. |

#### Response

```json
{ "success": true }
```

A changed `outboundTargetAddress` takes effect immediately: the open agent socket is closed, any pending reconnect is cancelled, and the new address is dialled at once rather than at the next backoff step. The reply does not wait for that attempt — an unreachable new address answers `200` and the client goes offline until a reconnect succeeds. Stored addresses are validated only when written, so a value saved before this check existed keeps working until it is edited.

- **400** — no field given, `inboundAllowedIp` not an IPv4 address or network, `inboundAllowedIp` sent for an outbound client, `outboundTargetAddress` sent for an inbound client, `outboundTargetAddress` not a usable `host:port`, or `autoUpdateCron` neither empty, `null` nor a valid cron expression.
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

The client's stored Docker state goes with it (foreign key cascade). For an outbound client any pending reconnect is cancelled first; an open agent socket is closed with `4000 Client deleted`. Nothing on the host is touched.

- **404** — client not found.

---

### Reconnect An Outbound Client

`POST /api/v1/clients/:clientId/reconnect`

**Description:** Dials an outbound client's agent again, now. Any open socket is closed and a pending backoff step is dropped, so the attempt starts from scratch rather than waiting out the ladder. The reply does not wait for the attempt: an unreachable agent answers `200` and the client stays offline until a later attempt succeeds. Inbound clients own their own reconnect ladder, so the route refuses them.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

```json
{ "status": "reconnecting" }
```

- **400** — the client is not an outbound client.
- **404** — no such client.

---

### Run Auto-Update On One Client

`POST /api/v1/clients/:clientId/auto-update/run`

**Description:** Asks one agent to run its auto-update now, for every schedule it holds. The command carries nothing: which containers take part is the host's own reading of its labels, the same reading a scheduled run makes. The reply says whether the agent was asked, not what came of it — the run reports itself as an `autoupdate.run` event, which is where every reader of a run's outcome takes it from. Nothing in the dashboard calls this route any more; it is kept for scripted use.

#### Path Parameters

| Parameter  | Type   | Required | Description                  |
| :--------- | :----- | :------- | :--------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client.      |

#### Response

```json
{ "success": true }
```

- **404** — no such client.
- **409** — the client is offline, or its agent could not be asked (it does not declare the `auto-update` capability, or sending failed). The message names which.

---

## 🎫 Registration Tokens

### List Tokens

`GET /api/v1/tokens`

**Description:** Lists all registration tokens including used and expired ones.

#### Response (Array of Token objects)

| Field              | Type           | Description                                     |
| :----------------- | :------------- | :---------------------------------------------- |
| `tokenHash`        | string         | SHA-256 of the token, hex. The token itself is not stored and cannot be listed. |
| `createdAt`        | string         | Creation timestamp.                             |
| `expiresAt`        | string         | ISO 8601 expiry timestamp (30 min from creation). |
| `usedAt`           | string \| null | When a client registered with this token.       |
| `displayName`      | string \| null | Name the client will be created under, if the token carries one. |
| `inboundAllowedIp` | string \| null | Allowed address or network the client will start with, if the token carries one. |

The rows also carry the database columns under their own names (`token_hash`, `created_at`, `expires_at`, `used_at`, `display_name`, `allowed_ip`); the dashboard reads the camelCase fields.

**Example Response:**

```json
[
    {
        "tokenHash": "9f86d081884c...",
        "createdAt": "2024-01-01 10:00:00",
        "expiresAt": "2024-01-01T10:30:00.000Z",
        "usedAt": null,
        "displayName": "docker-host-01",
        "inboundAllowedIp": "192.168.1.0/24"
    }
]
```

### Create Token

`POST /api/v1/tokens`

**Description:** Generates a new short-lived registration token (valid for 30 minutes), optionally carrying what the registering agent cannot tell the server about itself.

The response is the only place the token appears in the clear: the server stores just its SHA-256 hash, and [List Tokens](#list-tokens) returns that hash.

#### Request Body

The body is optional; a request without one behaves as it always did.

| Field              | Type   | Required | Description                                                                                     |
| :----------------- | :----- | :------- | :---------------------------------------------------------------------------------------------- |
| `displayName`      | string | No       | Name the client is created under. Without it the hostname the agent reports is used.            |
| `inboundAllowedIp` | string | No       | IPv4 address or CIDR network the client is restricted to. Without it the address the agent registers from is used. |

#### Response

```json
{
    "token": "a1b2c3d4e5...",
    "expiresAt": "2024-01-01T10:30:00.000Z",
    "displayName": "docker-host-01",
    "inboundAllowedIp": "192.168.1.0/24"
}
```

- **400** — `displayName` longer than 100 characters, or `inboundAllowedIp` not an IPv4 address or network.

Both defaults are stored with the token and applied by `POST /api/v1/register`. Tokens issued before these fields existed carry neither and keep behaving as they did.

### Delete Token

`DELETE /api/v1/tokens/:tokenHash`

**Description:** Manually invalidates and deletes a registration token.

#### Path Parameters

| Parameter   | Type   | Required | Description                                       |
| :---------- | :----- | :------- | :------------------------------------------------ |
| `tokenHash` | string | **Yes**  | The `tokenHash` of the token, as the list returns it. |

#### Response

```json
{ "status": "deleted" }
```

A token that does not exist answers `404` with `{ "error": "Token not found" }`.

### Register Client (Public)

`POST /api/v1/register`

**Description:** Public endpoint used by the client agent to register itself using a valid token. Returns the client's identity: a `clientId` and a permanent `authToken` for subsequent WebSocket connections. Both are issued by the **server**; every successful call creates a new client.

#### Request Body

| Field      | Type   | Required | Description                                     |
| :--------- | :----- | :------- | :---------------------------------------------- |
| `token`    | string | **Yes**  | A valid, unused, and non-expired registration token. |
| `hostname` | string | No       | Hostname of the client device. Stored as `unknown` when missing. |

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

> The returned `token` is the permanent `authToken` and `clientId` the id the server knows the client by. The agent saves both in `identity.json` in its data directory; the `token` is used for all future WebSocket connections.
>
> Registering an agent again creates a **new** client entry; the previous one stays behind offline and can be deleted in the UI.
>
> The new client's display name and allowed address come from the token when it carries them (see `POST /api/v1/tokens`). Otherwise the agent's reported hostname names it and the address it registered from becomes its allowed address, which is what a token without defaults does.

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

A container carries no status text (`"Up 2 hours"`): Docker's would be frozen at the moment the agent took the state and stand still until the next push. The agent sends the timestamps instead, and the dashboard derives the text from them:

| Field        | Type   | Description |
| :----------- | :----- | :---------- |
| `startedAt`  | string | `State.StartedAt`, ISO 8601. Missing when the container never started. |
| `finishedAt` | string | `State.FinishedAt`, ISO 8601. Missing when the container never stopped. |
| `exitCode`   | number | `State.ExitCode` of the last run. |

All three are optional: an agent from before them does not send them, and a state stored before them does not hold them. A state from such an agent may still carry the old `status` field; nothing reads it.

An image carries the platform it was built for, from `image inspect`, and — when a container runs it — the cached result of the last update check:

| Field         | Type   | Description |
| :------------ | :----- | :---------- |
| `platform`    | object | `{ "os": "linux", "architecture": "amd64" }`. A local image holds one platform, even when its tag points to an index of several. Missing from agents that predate it. |
| `updateCheck` | object | `{ hasUpdate, remoteDigest, checkedAt, error? }` for this tag, platform and local digest. Only on images a container runs: nothing else is checked. |

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

`image:update` is pull & recreate: the agent pulls `target`, then recreates every container configured with it that does not run the new image. `params.containerIds` (a list of container IDs on that host) limits the recreate to those containers, and `params.force: true` recreates them even when they already run the new image. For `image:remove`, `params.force` forces the removal.

#### Response

```json
{ "actionId": "…", "success": true }
```

The body is the agent's `DOCKER_ACTION_RESULT`. When the agent reports `success: false`, the status is **`500`** and the body carries its `error`; the failure is also recorded as `action.failed` in the activity list.

- **400** — `action` not in the list above, `target` missing for anything but `image:prune`, or `params` not an object. Checked before the agent is contacted: whatever passes goes to that host's Docker socket.
- **503** — client is not connected, or its connection closed before it reported a result (`"Client disconnected before reporting a result"`). This used to wait for the full timeout and answer `504`.
- **504** — client did not respond within the action timeout (120 s).

> On a successful `image:pull` or `image:update`, the backend automatically re-runs `ImageUpdateService.checkForUpdate` (from `@dim/shared/node`) against the pulled `target` and updates the cached digest.

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

**Description:** Checks the image registry for a newer image behind the given tag. Supports Docker Hub, `ghcr.io`, and `lscr.io`. Caches the result in `image_update_checks`.

The same tag is a different image on every platform, so the server looks up which hosts run the image in a container and on which platform, asks the registry once per tag, platform and local digest, and answers per host. A digest counts as outdated only if the registry's entry for that platform changed; a rebuild for another architecture is no update. An image no container runs is not checked.

#### Query Parameters

| Parameter     | Type   | Required | Description                                                                                      |
| :------------ | :----- | :------- | :----------------------------------------------------------------------------------------------- |
| `repoTag`     | string | **Yes**  | Image reference as stored in `repoTags` (e.g. `nginx:latest`).                                   |
| `repoDigests` | string | No       | Comma-separated `repoDigests` from the local image; narrows the check to the hosts holding one of them. |

#### Response

```json
{
    "repoTag": "nginx:latest",
    "localDigest": "sha256:…",
    "remoteDigest": "sha256:…",
    "hasUpdate": true,
    "platform": { "os": "linux", "architecture": "arm64" },
    "remotePlatformDigest": "sha256:…",
    "remoteLabels": {
        "org.opencontainers.image.version": "1.27.2",
        "org.opencontainers.image.revision": "4f1c…",
        "org.opencontainers.image.source": "https://github.com/…"
    },
    "results": [
        {
            "clientId": "…",
            "platform": { "os": "linux", "architecture": "arm64" },
            "hasUpdate": true,
            "remoteDigest": "sha256:…"
        }
    ]
}
```

`results` holds one entry per host that runs the image; the top-level fields sum them up (`hasUpdate` if any host has one). An entry carries `error` when the remote digest cannot be fetched or the registry has no image for the host's platform (`No image for linux/arm64`) — `hasUpdate` is then `false`. A refused request is named by its status: `Registry rate limit reached (429)`, `Registry denied access (401)`, `Tag not found in registry (404)`, `Registry request failed (HTTP 500)` or `Registry unreachable`. A rate limit additionally sets `rateLimited` and `retryAfterSeconds` — the registry's `Retry-After`, or 3600 when it sent none — and, where the registry sends `ratelimit-remaining` (Docker Hub does), `rateLimitRemaining` carries its count. When no container runs the image, `results` is empty and `error` is `No container runs this image`. A request without `repoTag` gets `400`.

`remoteLabels` holds the `org.opencontainers.image.*` labels of the image the update would bring. They are fetched only when `hasUpdate` is `true` and the platform is known, cost one more registry request, and are stored with the check until the remote digest changes. An image that sets no such labels gives `{}`; `null` means the registry did not give them. The same field appears on `updateCheck` of the images in a Docker state.

---

## 🛠️ Settings & Maintenance

### Get Settings

`GET /api/v1/settings/cleanup`

**Description:** Retrieves the `settings` block of `config.yaml`, every default filled in. The known values are returned as strings; a key added to the file by hand comes back as YAML read it. The `security` block is not part of the response: it is configured in `config.yaml` only.

#### Response

The defaults:

```json
{
    "token_retention_days": "30",
    "token_cleanup_interval_hours": "24",
    "image_version_cache_ttl_days": "30",
    "image_version_cache_cleanup_orphans": "true",
    "image_version_cache_cleanup_interval_hours": "24",
    "image_update_check_interval_seconds": "0",
    "container_auto_update_cron": "",
    "container_auto_update_label": "dim.auto-update=true",
    "container_auto_update_delay_label": "dim.auto-update-delay",
    "notification_retention_days": "90",
    "notification_retention_count": "500",
    "notification_cleanup_interval_hours": "24"
}
```

| Setting                                      | Description                                                                   |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| `token_retention_days`                       | Days to retain used/expired registration tokens before the cleanup removes them. `"0"` removes them on the next run. |
| `token_cleanup_interval_hours`               | Interval of the automatic token cleanup. `"0"` disables the scheduler.        |
| `image_version_cache_ttl_days`               | Max age of a cached `image_update_checks` row (measured against `checked_at`). `"0"` disables TTL cleanup. |
| `image_version_cache_cleanup_orphans`        | `"true"`/`"false"` — also remove cache rows whose `image_ref` is no longer referenced by any client state. |
| `image_version_cache_cleanup_interval_hours` | Interval of the automatic cache cleanup scheduler. `"0"` disables the scheduler. |
| `image_update_check_interval_seconds`        | Interval of the image update check sweep. `"0"` disables it.                  |
| `container_auto_update_*`                    | See [Container Auto-Update](#container-auto-update).                          |
| `notification_retention_days`                | Days to keep activity events, measured against `occurredAt`. `"0"` is not "forever": it falls back to `90`. |
| `notification_retention_count`               | Minimum number of the newest activity events always kept.                     |
| `notification_cleanup_interval_hours`        | Interval of the automatic activity cleanup. `"0"` disables the scheduler.     |

The `notification_*` names predate the rename to activity and are kept because they are stored values. `token_retention_days` replaced `retention_invalid_tokens_days` without taking its value over, and `retention_invalid_tokens_count` is gone; the server removes both old keys from `config.yaml` at startup.

### Update Settings

`PUT /api/v1/settings/cleanup`

**Description:** Updates settings. All fields are optional; only provided fields are updated.

#### Request Body

Pass any of the setting keys to update them.

```json
{
    "token_retention_days": "60",
    "image_version_cache_ttl_days": "60"
}
```

| Kind of setting | Keys | Accepted values |
| :-------------- | :--- | :-------------- |
| Counts, days, intervals | `token_*`, `image_version_cache_ttl_days`, `image_version_cache_cleanup_interval_hours`, `image_update_check_interval_seconds`, `notification_*` | A non-negative whole number, as string or number. Stored as string. |
| Switches | `image_version_cache_cleanup_orphans` | `"true"`, `"false"` or a boolean. Stored as string. |
| Cron | `container_auto_update_cron` | Empty, or a valid cron expression. |
| Labels | `container_auto_update_label`, `container_auto_update_delay_label` | Any string. |

Keys not listed are accepted and written as they are: the settings page sends back everything it read, including keys an operator added to `config.yaml` by hand, and rejecting or dropping them would delete them from the file.

#### Response

```json
{ "success": true }
```

- **400** — a value does not match the table above, or the body contains `security`. Network and HSTS settings are configured in `config.yaml` only; a session token must not be enough to lock every agent out.

> A changed value takes effect without a restart: `image_version_cache_*` restarts the `ImageUpdateCacheCleanupService` scheduler, `image_update_check_interval_seconds` the `ImageUpdateCheckSchedulerService`, `notification_*` the `NotificationCleanupService`, and `token_*` the `TokenCleanupService`. A change to one of the `container_auto_update_*` keys sends every connected agent a fresh policy; a changed label is also broadcast to the dashboards.

### Run Invalid Token Cleanup

`POST /api/v1/settings/cleanup/invalid-tokens`

**Description:** Runs `TokenCleanupService` now, removing registration tokens that have been invalid (used or expired) for longer than `token_retention_days`. Recorded as a `manual` run of `token-cleanup`.

#### Response

```json
{ "success": true, "removed": 4 }
```

### Run Image Version Cache Cleanup

`POST /api/v1/settings/cleanup/image-version-cache`

**Description:** Runs `ImageUpdateCacheCleanupService` now, recorded as a `manual` run of `image-cache-cleanup`. Removes orphaned `image_update_checks` rows (if enabled) and expired rows (if `image_version_cache_ttl_days > 0`).

#### Response

```json
{ "success": true, "orphansRemoved": 2, "expiredRemoved": 7 }
```

### Run Activity Cleanup

`POST /api/v1/settings/cleanup/notifications`

**Description:** Runs `NotificationCleanupService` now, recorded as a `manual` run of `notification-cleanup`, applying the retention policy to the activity table. The path keeps the old name; what it prunes is the activity list.

#### Response

```json
{ "success": true, "removed": 12 }
```

---

### Scheduler Status

`GET /api/v1/settings/scheduler-status`

**Description:** Returns the current status of the schedulers the server itself runs. Auto-update is not among them — the agents run their own, and what they did is read from the [activity list](#list-activity) instead.

#### Response

```json
{
    "schedulers": {
        "image-update-check": {
            "isRunning": false,
            "nextRun": "2026-04-18T11:00:00.000Z",
            "lastRun": {
                "trigger": "schedule",
                "status": "partial",
                "startedAt": "2026-04-18T10:00:00.000Z",
                "finishedAt": "2026-04-18T10:00:41.000Z",
                "result": { "checked": 7, "total": 12, "pausedRegistries": ["registry-1.docker.io"] },
                "error": null
            },
            "registries": [
                {
                    "registry": "registry-1.docker.io",
                    "targets": 12,
                    "checked": 7,
                    "lastCheckedAt": "2026-04-18T10:00:00.000Z",
                    "pausedUntil": "2026-04-18T16:00:00.000Z",
                    "remaining": 0,
                    "error": "Registry rate limit reached (429)"
                }
            ]
        },
        "image-cache-cleanup": {
            "isRunning": false,
            "nextRun": "2026-04-19T04:00:00.000Z",
            "lastRun": {
                "trigger": "manual",
                "status": "success",
                "startedAt": "2026-04-18T09:12:00.000Z",
                "finishedAt": "2026-04-18T09:12:00.000Z",
                "result": { "orphansRemoved": 2, "expiredRemoved": 7 },
                "error": null
            }
        },
        "notification-cleanup": { "isRunning": false, "nextRun": "2026-04-19T04:00:00.000Z", "lastRun": null },
        "token-cleanup": { "isRunning": false, "nextRun": null, "lastRun": null }
    }
}
```

Every scheduler reports `isRunning`, `nextRun` (`null` while its interval is `0`) and `lastRun`, the last run it finished (`null` before its first). `lastRun.status` is `success`, `partial` (the run finished but a rate limit paused a registry), `failed` (with `error`) or `interrupted` (the server stopped during the run; no `finishedAt`, no `result`). `result` has one shape per scheduler: `{ checked, total, pausedRegistries }`, `{ orphansRemoved, expiredRemoved }` or `{ removed }`. The state is kept in the database and survives a restart.

`registries` (image update check only) has one entry per registry host the checked images come from, built from the current images, so it is there before the first sweep. `pausedUntil` is set while a rate limit pauses the host, `remaining` is the last `ratelimit-remaining` it sent (`null` for registries that send none), and `error` is the rate limit while the pause lasts, or the error every check of the last sweep failed with.

---

### Run Image Update Check Now

`POST /api/v1/settings/image-update-check/run`

**Description:** Triggers a full image update check sweep synchronously. Every known image tag is checked against its registry and the result is written to `image_update_checks`. Unlike the scheduled sweep, it also asks registries that are paused by a rate limit; one that refuses again is paused anew.

#### Response

```json
{ "success": true, "checked": 42 }
```

---

### Container Auto-Update

A container takes part in automatic updates if it carries the configured Docker label (`container_auto_update_label`), or if the project it belongs to has auto-update switched on (see [Projects](#-projects)). The label wins over the project, and the same label key carrying `false` opts a container out of both.

Neither source is stored against a container: both are read off its labels, which is what lets the **agent** decide it. The server performs no runs and contacts no registry on a host's behalf — it resolves the schedule inheritance, sends each agent its [policy](#server---client-events) (`AUTO_UPDATE_POLICY`), and reads back the `autoupdate.run` events the agents report. A host that updated itself while this server was down therefore appears in full as soon as it hands its queue over.

**Related settings:**

| Key                                     | Description                                                                                   |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------- |
| `container_auto_update_cron`            | The default schedule every host and project inherits while it names none of its own. Empty means only hosts and projects with an expression of their own take part. |
| `container_auto_update_label`           | Docker label marking a container for auto-update. Format `key=value` or `key` (any value).   |
| `container_auto_update_delay_label`     | Docker label holding a per-container delay in days. Empty disables delay support.             |

> Changing any of them sends every connected agent a fresh `AUTO_UPDATE_POLICY`.

The server has no auto-update endpoint beyond these settings. What each host did is in the
activity, where the host itself put it — `autoupdate.run` events, queried through
[Activity](#-activity) — and a run is asked for one host at a time, see
[Run Auto-Update On One Client](#run-auto-update-on-one-client).

Two endpoints that used to sit here are gone, with the fleet panel they fed:
`GET /api/v1/settings/container-auto-update/status`, which folded the newest `autoupdate.run`
per host and schedule into one response, and `POST /api/v1/settings/container-auto-update/run`,
which asked every connected agent at once and answered with a count of commands sent.

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

An invalid or empty expression answers `200` with `{ "valid": false }` and no reason. A body without a string `expr` gets `400`.

#### Auto-Update Label

`GET /api/v1/settings/container-auto-update/label` — the configured label on its own.

**Response:**

```json
{ "labelFilter": "dim.auto-update=true" }
```

The container lists read it to show which containers carry the label, and every
signed-in user sees those lists — reading the whole settings block for one string
is more than they need. A change to the setting broadcasts
`AUTO_UPDATE_LABEL_UPDATE`.

There is no endpoint for enrolling a single container: a container takes part
because it carries this label, or because the project it belongs to has auto-update
switched on (see [Projects](#-projects)). The same label key carrying `false`
opts a container out of both.

---

## 📦 Projects

A project is a group of containers across the whole fleet, defined by a **query**. DIM stores
the name, the query and the settings; membership is resolved from the Docker state the agents
report on every request, so a container that stops matching leaves the project by itself.

A container belongs to **one project at most**. Creating or changing a query that would take
containers another project already has is refused with `409`. A container started later can
still match two queries. It is then a **conflict**: it is listed under every project it
matches, counted in their `conflictCount` and marked as an error in the dashboard, and it is
updated through none of them.

- Without the auto-update label it is excluded from auto-update altogether. Every run of a
  project it matches reports `autoupdate.conflict` at level `error`.
- With the label it is updated on the **host schedule** instead, and the host run reports
  `autoupdate.conflict` at level `warning`. A host without a schedule of its own leaves it
  excluded, as above.

The event carries `data.projectIds`, `data.projectNames` and `data.fallback` (`"host"` or
`null`), and the container in `subject`. A run that reported a conflict is never a silent
"nothing to do" run; its `autoupdate.run` carries `data.conflicts`.

`cron` is nullable on purpose — `null` means *inherit the default from the settings*, not
*off*. Auto-update is switched off through `autoUpdate`.

#### The query

A query is a list of criteria. Each one is asked about one container on one host:

| `field`              | Compared with                                                                 |
| :------------------- | :---------------------------------------------------------------------------- |
| `client.displayName` | The client's display name, or its hostname when it has none.                  |
| `client.hostname`    | The client's hostname.                                                        |
| `container.name`     | The container name, without the leading `/`.                                  |
| `image.name`         | `configImage` (or `image`). A value without a tag is compared with the repository only, so every tag matches; with a tag, with `repository:tag` (a reference without a tag counts as `latest`). |

- `op`: `equals` or `wildcard` (`*` any characters, `?` exactly one). Both ignore case.
- `negate`: inverts the criterion. A missing attribute (an image without a reference) matches
  nothing, so its negation matches.
- `join`: `and` or `or`, joining the criterion to **everything before it**. Criteria are
  evaluated strictly from top to bottom without precedence: `A or B and C` is `(A or B) and C`.
  The first criterion's `join` is ignored.

```json
[
    { "id": "c1", "join": "and", "field": "container.name", "op": "wildcard", "negate": false, "value": "nextcloud-*" },
    { "id": "c2", "join": "or", "field": "image.name", "op": "wildcard", "negate": false, "value": "redis:7*" },
    { "id": "c3", "join": "and", "field": "client.displayName", "op": "wildcard", "negate": true, "value": "test-*" }
]
```

### List Projects

`GET /api/v1/projects`

**Response:**

```json
{
    "projects": [
        {
            "id": "3f0c…",
            "name": "web",
            "query": [{ "id": "c1", "join": "and", "field": "container.name", "op": "wildcard", "negate": false, "value": "web-*" }],
            "autoUpdate": true,
            "cron": "0 3 * * *",
            "createdAt": "2026-09-13T08:00:00.000Z",
            "clientIds": ["…"],
            "containerCount": 4,
            "imageCount": 3,
            "conflictCount": 0
        }
    ]
}
```

### Preview a Query

`POST /api/v1/projects/preview`

**Request:**

```json
{ "query": [ … ], "excludeId": "3f0c…" }
```

Answers what the query matches right now, and which of those containers already belong to
another project. `excludeId` is the project being edited, whose own members are no conflict.

```json
{
    "members": [{ "clientId": "…", "containerId": "…", "containerName": "web-app" }],
    "conflicts": [{ "clientId": "…", "containerId": "…", "containerName": "redis", "projectId": "…", "projectName": "cache" }]
}
```

### Create Project

`POST /api/v1/projects`

**Request:**

```json
{ "name": "web", "query": [ … ], "autoUpdate": true, "cron": "0 3 * * *" }
```

`name` and a query with at least one criterion are required; `autoUpdate` defaults to `false`
and `cron` to `null`. A query that matches nothing yet is allowed. Answers `201` with the
created project. A name that is already taken answers `409`, as does a query that overlaps
another project (the body then carries `conflicts` as above); an invalid `cron` answers `400`.

### Update Project

`PATCH /api/v1/projects/:id`

**Request:**

```json
{ "name": "web", "query": [ … ], "autoUpdate": false, "cron": null }
```

Every field is optional, but at least one has to be given; a field that is absent is left as
it is, which is why `"cron": null` (inherit) has to be distinguishable from "not mentioned".
The same `409` checks apply as on create. Answers the updated project, or `404` for an
unknown id.

### Delete Project

`DELETE /api/v1/projects/:id`

Removes the DIM entry and nothing else — no container is touched. Answers `{ "ok": true }`,
or `404` for an unknown id.

Every mutating endpoint broadcasts `PROJECTS_UPDATE` with the full list response.

---

## 📣 Activity

Everything that happened, as its originator reported it.

An event carries no message. It carries a `kind`, a `level`, what it is about and the facts
of that kind — an exit code, a health status, a run's counts — and the text is composed in
the frontend out of those. That is what lets an agent of an older version stay useful: it
reports the same facts and how they are worded is not its business. It also means filtering
by `kind` and `level` is exact rather than a search through prose.

`level` is one of `trace`, `info`, `warning` and `error`, lowest first. `trace` marks routine
bookkeeping — an agent connecting or disconnecting — which the dashboard hides by default.
A level this build does not know is read as `info`.

`kind` is **not** a closed set on the wire. An agent of another version may report a kind
this server does not know; it is stored as it is, and the dashboard falls back to printing
the kind itself rather than dropping an observation nobody can make again.

Two timestamps, and the difference matters. `occurredAt` is the originator's clock and
orders the list; `receivedAt` is the server's. After an offline stretch an event from 03:00
arrives at 08:00: it belongs at 03:00 in the list, while the seen state is per event, so a
late arrival cannot slip in under entries a user has already worked through. The gap between
the two also exposes an agent whose clock is wrong.

`correlationId` is entered by whoever caused the group — the server's `actionId` for an
action from the dashboard, the agent's `runId` for an auto-update run. Nothing matches
names, and nothing depends on arrival order.

### List Activity

`GET /api/v1/activity`

`seen` is that of the calling user; who else has seen an event is not part of the answer.

**Response:**

```json
[
    {
        "id": "d3f1…",
        "occurredAt": "2026-09-13T03:00:07.412Z",
        "receivedAt": "2026-09-13T08:14:02.900Z",
        "source": "agent",
        "clientId": "…",
        "kind": "container.died",
        "level": "warning",
        "correlationId": "run-…",
        "subject": {
            "containerName": "nextcloud-app",
            "containerId": "…",
            "imageRef": "nextcloud:31",
            "projectName": "nextcloud"
        },
        "data": { "exitCode": 1 },
        "seen": false
    }
]
```

Newest first by `occurredAt`.

### Mark Seen

`POST /api/v1/activity/seen` with `{ "ids": ["…"] }` marks the listed events seen by the
calling user in one request (ids that are not there are skipped; an empty or missing list is a
`400`) and answers `{ "ok": true }`. There is no endpoint for a single event: the dashboard
marks a whole group, or everything the filters leave, with this one.

### Delete Activity

`DELETE /api/v1/activity` removes all events and answers `{ "ok": true }`. Single events
cannot be deleted; retention and "Delete all" are the only ways an event goes.

Retention runs on its own through `notification_retention_days` and
`notification_retention_count` — the setting names predate the rename and are kept because
they are stored values; the page they are set on is called "Activity History".

Over the dashboard WebSocket: a new event goes out as `ACTIVITY_APPENDED` with only the events
stored for the first time (a repeat from the at-least-once delivery is not sent again); marking
sends `ACTIVITY_SEEN` with the ids that turned seen, to the sessions of the calling user only;
"Delete all" broadcasts `ACTIVITY_UPDATE` with an empty list.

---

## 🏓 Misc

### Health

`GET /api/health` (no `/v1` prefix)

**Description:** Liveness probe, used by the image's `HEALTHCHECK` and the CI smoke test. No authentication — a probe has no session, and the answer discloses nothing.

| Status | Body                 | Meaning                                                   |
| :----- | :------------------- | :-------------------------------------------------------- |
| `200`  | `{"status":"ok"}`    | The process serves requests and its database is reachable |
| `503`  | `{"status":"error"}` | The database could not be queried                         |

Agent connections are not consulted: one offline agent must not mark the control plane as broken. The agent's web UI has its own `GET /api/health` on port 3001, which reports only that the agent process answers — not whether it is connected to the server. It serves the container's `HEALTHCHECK` alone: it exists only in the container image and answers only loopback, everyone else gets `404`.

**Why under `/api`:** the server answers every path outside `/api` with the dashboard's `index.html` and HTTP `200`, so a probe on `/health` would report success even without the route. Under `/api`, an unknown path is a `404`.

### Reachability

`GET /api/v1/ping`

**Description:** Answers "is there a DIM server at this URL?". The agent's web UI calls it for an address an operator has just typed. It deliberately checks nothing else: a server with a broken database is still reachable, and reporting otherwise during setup would point at the wrong problem. For "can this instance serve requests", use [Health](#health).

#### Response

```json
{ "status": "ok" }
```

---

## 🔌 WebSockets

### Dashboard Connection

`GET /ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time client status updates.

#### Authentication

The `dim_session` cookie, which the browser sends with the handshake by itself. A `token` query parameter is no longer accepted. Without the cookie the server closes with `4001 Unauthorized`, with an invalid or expired token with `4001 Invalid Token`.

#### Behavior

- On connect: The server immediately sends a `CLIENTS_UPDATE` with the full client list, then one `DOCKER_STATE_UPDATE` per client that has a stored state, then an `ACTIVITY_UPDATE` with the activity list. A dashboard therefore needs no REST call to fill its first screen.
- A ping/pong heartbeat runs every 30 seconds to detect dead connections.
- All broadcasts from `ProxyService` (e.g., agent connects/disconnects) are forwarded to all active dashboard sessions.

#### Events (Server -> Client)

| Event                 | Payload                                     | Description                                                       |
| :-------------------- | :------------------------------------------ | :---------------------------------------------------------------- |
| `CLIENTS_UPDATE`      | `Client[]`                                  | Full list of all clients and their statuses.                      |
| `DOCKER_STATE_UPDATE` | `{ clientId, state: DockerState }`          | Docker state snapshot pushed by an agent, rebroadcast to dashboards. |
| `DOCKER_ACTION_RESULT`| `{ clientId, result: DockerActionResult }`  | Result of a previously dispatched Docker action.                  |
| `SCHEDULER_STATUS_UPDATE` | `{ scheduler, status }` | One scheduler's status, in the shape of [Scheduler Status](#scheduler-status), whenever a run starts or ends or its timer is set. Auto-update has none, because the server runs none. |
| `AUTO_UPDATE_LABEL_UPDATE` | `{ labelFilter: string }`                   | The auto-update label setting changed.                            |
| `PROJECTS_UPDATE`     | `{ projects: ProjectSummary[] }`            | A project was added, changed or removed.                          |
| `ACTIVITY_UPDATE`     | `ActivityRecord[]`                          | The whole activity list: on connect, with the seen state of the session's user, and empty after "Delete all". |
| `ACTIVITY_APPENDED`   | `ActivityRecord[]`                          | Events stored for the first time, to be merged into the list by id. |
| `ACTIVITY_SEEN`       | `{ ids: string[] }`                         | Events the session's user has just marked seen. Sent to that user's sessions only. |

---

### Agent Connection

`GET /ws/agent`

**Description:** WebSocket endpoint for client agents. Requires the identity issued during registration — the `clientId` and the `authToken` together.

#### Query Parameters

| Parameter  | Type   | Required | Description                                                  |
| :--------- | :----- | :------- | :----------------------------------------------------------- |
| `clientId` | string | **Yes**  | The server-issued `clientId` from the agent's `identity.json`. |
| `token`    | string | **Yes**  | The permanent `authToken` from the agent's `identity.json`.    |

A request missing either half is closed with `4001 Authentication required`. The token may
also be sent as `Authorization: Bearer <token>`; the id has no header form.

#### Authentication Stages

1. Id and token are looked up as a pair — both have to name the same row (`4003 Invalid credentials` otherwise). The id alone is no secret, and a token alone used to make a client whoever its token happened to belong to.
2. Client's IP is checked against `security.allowed_networks` (`4003 Access denied`).
3. A token that belongs to an **outbound** client is refused (`4003 Access denied`): those are dialled by the server and never connect here.
4. Client's IP is checked against the client's allowed address or network; a client whose check is switched off skips this step (`4003 IP address mismatch`).
5. A 5-second window is given for the client to send an `AUTH` handshake message (`4001 Authentication timed out` otherwise). An `AUTH` whose payload does not parse is closed with `4000 Invalid payload`; any other first message is answered with `AUTH_FAILURE` and closed with `4003 Forbidden`.

A second connection under the same client id replaces the first, which is closed with `4000 Replaced by new connection`.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake, sent immediately after connection.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0",
    "capabilities": ["auto-update"]
}
```

`capabilities` says what this agent's build can do (currently `auto-update` and
`project-query`); a missing field is read as an empty list. The server reads it by asking whether an entry is in the list, never by exhausting it,
so a newer agent may name something this server has never heard of. `auto-update` means the
agent runs its own auto-update and is sent an `AUTO_UPDATE_POLICY`.

**`DOCKER_UPDATE`**
**Description:** Full Docker state snapshot (containers, images, volumes, networks). Sent after connect, on relevant Docker events, and on `REQUEST_STATE_UPDATE`.
**Payload:** `DockerState` without `updatedAt` (the server stamps it on persist).

**`DOCKER_ACTION_RESULT`**
**Description:** Response to a server-dispatched `DOCKER_ACTION`. Resolves the backend's pending promise and is rebroadcast to dashboards.
**Payload:**

```json
{ "actionId": "…", "success": true, "error": "…" }
```

**`ACTIVITY`**
**Description:** Events the agent has observed and has not had acknowledged yet. Sent as they happen while connected, and as a batch on every reconnect. A batch, not one message per event: an agent that was offline has a queue to hand over.
**Payload:**

```json
{ "events": [ { "id": "…", "occurredAt": "…", "kind": "container.died", "level": "warning", "correlationId": "…", "subject": { }, "data": { } } ] }
```

`source` and `clientId` are taken from the connection, not from the payload — an agent may only ever speak about itself. Delivery is **at-least-once**: the event keeps its id until the server acknowledges it, and the primary key makes a second copy a no-op.

The events are parsed one by one. A batch whose envelope does not parse (no `events` array) is dropped **without** an ack, so the agent keeps offering it. A single event that does not parse but carries an id is the exception: it is **acknowledged without being stored** and logged. Offering it again would change nothing, and because the agent hands its queue over in order, it would block every event behind it. An unparsable event without an id is simply dropped.

#### Server -> Client Events

**`AUTH_SUCCESS`**
**Payload:**

```json
{
    "lastSyncTime": null
}
```

`lastSyncTime` is always `null`; nothing reads it.

**`AUTH_FAILURE`**
**Description:** Sent when the first message of an inbound connection is not `AUTH`, directly before the socket is closed with `4003 Forbidden`. Every other refusal is a close code alone (see [Authentication Stages](#authentication-stages)).
**Payload:** `{}`

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

The agent validates the payload before running anything. An unknown `action`, a missing `target` (allowed empty only for `image:prune`) or a `params` value that is not an object is answered at once with `{ "actionId": "…", "success": false, "error": "Invalid action: <field>: <reason>" }`. A payload without `actionId` cannot be answered and is dropped with a warning in the agent's log.

**`REQUEST_STATE_UPDATE`**
**Description:** Asks the agent to immediately emit a fresh `DOCKER_UPDATE`.
**Payload:** `{}`

**`AUTO_UPDATE_POLICY`**
**Description:** Everything the agent needs to run auto-update by itself. Sent right after `AUTH_SUCCESS`, and again whenever the settings, a project, this client's own schedule or its display name change. Only to agents that declared the `auto-update` capability; `projects` stays empty for agents that did not also declare `project-query`, because they would read a project as a Compose stack name.
**Payload:**

```json
{
    "updatedAt": "2026-09-13T08:12:00.000Z",
    "host": { "hostname": "docker-01", "displayName": "Prod Web" },
    "labelKey": "dim.auto-update",
    "labelValue": "true",
    "delayLabelKey": "dim.auto-update-delay",
    "hostCron": "0 4 * * 0",
    "projects": [
        {
            "id": "3f0c…",
            "name": "nextcloud",
            "query": [ … ],
            "createdAt": "2026-09-13T08:00:00.000Z",
            "autoUpdate": true,
            "cron": "0 3 * * *"
        }
    ]
}
```

Every schedule in it is **already resolved** — default, then host, then project — so the
agent never sees a `null` and never has to know the inheritance rules. `hostCron` covers the
containers on this host that belong to no project; an empty string means it has no schedule
of its own. Projects with `autoUpdate: false` are listed too, because a container may be
enrolled through its label while still belonging to a project, and the project is what decides
*when* it is updated. The agent evaluates the queries itself; client criteria are matched
against `host`, the host as the server knows it, so the agent reaches the membership the
dashboard shows. `labelValue: null` means the presence of `labelKey` is enough; an empty
`labelKey` switches the label route off, and with it the `=false` opt-out.

The agent stores the policy on disk and keeps acting on it while the server is unreachable.

**`AUTO_UPDATE_RUN`**
**Description:** Run the configured auto-update now, without waiting for a schedule. Sent by `POST /api/v1/clients/:clientId/auto-update/run`, and only to agents that declared the `auto-update` capability. The agent runs every schedule it holds, each with its own `runId`, and marks the resulting `autoupdate.run` events `manual: true`.
**Payload:** `{}`

It deliberately carries no list of containers: which of them take part is the host's own
reading of the labels in front of it, and the server does not hold the better one. A run
asked for differs from a scheduled one only in that somebody is waiting — so it skips the
spreading jitter, and reports even when there was nothing to do.

**`ACTIVITY_ACK`**
**Description:** The ids the server has stored. The agent drops them from its queue; ids it does not name stay and are offered again.
**Payload:** `{ "ids": ["…"] }`

> After a successful `AUTH` / `AUTH_SUCCESS` exchange, the server registers the client in `ProxyService` and broadcasts a `CLIENTS_UPDATE` to all connected dashboards.
