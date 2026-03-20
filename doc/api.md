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
- [Settings & Maintenance](#-settings--maintenance)
    - [Get Settings](#get-settings)
    - [Update Settings](#update-settings)
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

## 🛠️ Settings & Maintenance

### Get Settings

`GET /api/v1/settings/cleanup`

**Description:** Retrieves current retention settings and network security configuration.

#### Response

```json
{
    "settings": {
        "retention_invalid_tokens_days": "30",
        "retention_invalid_tokens_count": "10",
        "retention_job_history_days": "90",
        "retention_job_history_count": "100"
    },
    "security": {
        "allowed_networks": ["0.0.0.0/0"],
        "trusted_networks": ["127.0.0.1/32"]
    }
}
```

| Setting                          | Description                                           |
| :------------------------------- | :---------------------------------------------------- |
| `retention_invalid_tokens_days`  | Days to retain expired/used registration tokens.      |
| `retention_invalid_tokens_count` | Minimum number of expired tokens to always keep.      |
| `retention_job_history_days`     | Days to retain job execution history.                 |
| `retention_job_history_count`    | Minimum number of history entries to always keep.     |
| `security.allowed_networks`      | CIDR ranges allowed to connect as agents (global whitelist). |
| `security.trusted_networks`      | CIDR ranges exempt from per-client IP validation.     |

### Update Settings

`PUT /api/v1/settings/cleanup`

**Description:** Updates retention settings and/or security configuration. All fields are optional; only provided fields are updated.

#### Request Body

```json
{
    "settings": {
        "retention_invalid_tokens_days": "60",
        "retention_job_history_days": "180"
    },
    "security": {
        "allowed_networks": ["10.0.0.0/8"],
        "trusted_networks": ["127.0.0.1/32", "192.168.1.0/24"]
    }
}
```

#### Response

```json
{ "status": "updated" }
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

| Event            | Payload                                                               | Description                              |
| :--------------- | :-------------------------------------------------------------------- | :--------------------------------------- |
| `CLIENTS_UPDATE` | `Client[]`                                                            | Full list of all clients and their statuses. |

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

> After a successful `AUTH` / `AUTH_SUCCESS` exchange, the server registers the client in `ProxyService` and broadcasts a `CLIENTS_UPDATE` to all connected dashboards.
