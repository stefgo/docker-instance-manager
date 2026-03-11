# 📚 API Documentation

**Base URL:** `/api/v1` (unless otherwise noted)

> **Note:** All API responses are generally JSON formatted.

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
    - [Get Client History](#get-client-history)
    - [Get Client File System](#get-client-file-system)
    - [Get Client Version](#get-client-version)
    - [Delete Client](#delete-client)
- [Jobs](#-jobs)
    - [List Client Jobs](#list-client-jobs)
    - [Save Job](#save-job)
    - [Delete Job](#delete-job)
    - [Run Action](#run-action)
- [Resources](#-resources)
    - [List Resources](#list-resources)
    - [Create Resource](#create-resource)
    - [Update Resource](#update-resource)
    - [Delete Resource](#delete-resource)
- [Registration Tokens](#-registration-tokens)
    - [List Tokens](#list-tokens)
    - [Create Token](#create-token)
    - [Delete Token](#delete-token)
    - [Register Client (Public)](#register-client-public)
- [Settings & Maintenance](#-settings--maintenance)
    - [Get Cleanup Settings](#get-cleanup-settings)
    - [Update Cleanup Settings](#update-cleanup-settings)
    - [Run Maintenance](#run-maintenance)
- [WebSockets](#-websockets)
    - [Dashboard Connection](#dashboard-connection)
    - [Agent Connection](#agent-connection)
        - [Client -> Server Events](#client---server-events)
        - [Server -> Client Events](#server---client-events)

---

## 🔐 Authentication

### Login

`POST /login` (Note: No `/v1` prefix, maps to `/api/login`)

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

`GET /auth/config`

**Description:** Returns the public OIDC configuration for the frontend to initiate login flows.

#### Response

| Field          | Type   | Description             |
| :------------- | :----- | :---------------------- |
| `authority`    | string | The OIDC authority URL. |
| `client_id`    | string | The OIDC client ID.     |
| `redirect_uri` | string | The OIDC redirect URI.  |

### OIDC Login

`GET /auth/login`

**Description:** Redirects the user's browser to the OIDC provider's login page.

#### Response

- **302 Redirect:** Redirects to the OIDC provider.

### OIDC Callback

`GET /auth/callback`

**Description:** Handling callback from OIDC provider.

#### Query Parameters

| Parameter | Type   | Required | Description                                           |
| :-------- | :----- | :------- | :---------------------------------------------------- |
| `code`    | string | Yes      | The authorization code returned by the OIDC provider. |
| `state`   | string | Yes      | The state parameter for CSRF protection.              |

#### Response

- **302 Redirect:** Redirects to the frontend application with a `token` query parameter on success.

---

## 👤 Users

### List Users

`GET /v1/users`

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
        "created_at": "2023-10-27T10:00:00.000Z",
        "updated_at": "2023-10-27T10:00:00.000Z"
    }
]
```

### Create User

`POST /v1/users`

**Description:** Creates a new user.

#### Request Body

| Field          | Type   | Required      | Description                                               |
| :------------- | :----- | :------------ | :-------------------------------------------------------- |
| `username`     | string | **Yes**       | The desired username.                                     |
| `password`     | string | _Conditional_ | The password (required for "local" auth).                 |
| `auth_methods` | string | No            | Auth methods like `"local"`, `"oidc"`, or `"local,oidc"`. |

**Example Request:**

```json
{
    "username": "jdoe",
    "password": "password123",
    "auth_methods": "local,oidc"
}
```

#### Response

**Example Response:**

```json
{
    "status": "created"
}
```

### Update User

`PUT /v1/users/:userId`

**Description:** Updates an existing user's password or authentication methods.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to update. |

#### Request Body

| Field          | Type   | Required | Description                                                     |
| :------------- | :----- | :------- | :-------------------------------------------------------------- |
| `password`     | string | No       | The new password. Only allowed if user has "local" auth method. |
| `auth_methods` | string | No       | Comma-separated list of new authentication methods.             |

#### Response

**Example Response:**

```json
{
    "status": "updated"
}
```

### Delete User

`DELETE /v1/users/:userId`

**Description:** Deletes a user. Note: You cannot delete yourself or the last remaining user.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

---

## 📅 Global Data Views

### List All Jobs

`GET /v1/jobs`

**Description:** Retrieves all jobs configured across all registered clients.

#### Response (Array of Job objects)

_Same structure as [List Client Jobs](#list-client-jobs)._

### Get Global History

`GET /v1/history`

**Description:** Retrieves the execution history of all jobs across all clients.

#### Response (Array of History objects)

_Same structure as [Get Client History](#get-client-history)._

---

## 🖥 Clients

### List Clients

`GET /v1/clients`

**Description:** Retrieves a list of all registered clients with their connection status.

#### Response

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "manager-client-01",
        "status": "online",
        "lastSeen": "2023-10-27T12:30:00.000Z"
    }
]
```

### Get Client History

`GET /v1/clients/:clientId/history`

**Description:** Retrieves the execution history of jobs for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
[
    {
        "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
        "name": "Daily Cleanup",
        "type": "maintenance",
        "status": "success",
        "start_time": "2023-10-26T02:00:00.000Z",
        "end_time": "2023-10-26T02:15:30.000Z",
        "exit_code": 0,
        "stdout": "Task finished successfully...",
        "stderr": null
    }
]
```

### Get Client File System

`GET /v1/clients/:clientId/fs`

**Description:** Lists files and directories on the client's file system.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Query Parameters

| Parameter | Type   | Required | Description                                                    |
| :-------- | :----- | :------- | :------------------------------------------------------------- |
| `path`    | string | No       | The absolute path to list (e.g., `/var/log`). Defaults to `/`. |

**Example Request URL:**
`GET /v1/clients/550e8400.../fs?path=/etc`

#### Response

**Example Response:**

```json
[
    {
        "name": "passwd",
        "isDirectory": false,
        "path": "/etc/passwd",
        "size": 1892
    },
    {
        "name": "nginx",
        "isDirectory": true,
        "path": "/etc/nginx",
        "size": 4096
    }
]
```

### Get Client Version

`GET /v1/clients/:clientId/version`

**Description:** Retrieves the version of the agent running on the client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
{
    "requestId": "req-uuid-123",
    "version": "1.0.0"
}
```

### Delete Client

`DELETE /v1/clients/:clientId`

**Description:** Removes a client registration. If the client is connected, it will be disconnected.

#### Path Parameters

| Parameter  | Type   | Required | Description                       |
| :--------- | :----- | :------- | :-------------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

---

## 📅 Jobs

### List Client Jobs

`GET /v1/clients/:clientId/jobs`

**Description:** Retrieves all jobs configured for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
[
    {
        "id": "job-123",
        "name": "Daily Cleanup",
        "schedule": {
            "interval": 1,
            "unit": "days",
            "weekdays": []
        },
        "scheduleEnabled": true,
        "resource": {
            "id": "res-abc",
            "name": "Primary Database",
            "status": "online"
        }
    }
]
```

### Save Job

`POST /v1/clients/:clientId/jobs`

**Description:** Creates or updates a job configuration on the client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field             | Type     | Required | Description                                                                |
| :---------------- | :------- | :------- | :------------------------------------------------------------------------- |
| `id`              | string   | No       | UUID of the job. If provided, updates existing job; otherwise creates new. |
| `name`            | string   | **Yes**  | Name of the job.                                                           |
| `schedule`        | string   | **Yes**  | Cron-like schedule string.                                                 |
| `scheduleEnabled` | boolean  | **Yes**  | Enable/disable schedule.                                                   |
| `resource`        | string   | **Yes**  | The ID of the resource to use.                                             |

**Example Request:**

```json
{
    "id": "job-123",
    "name": "Daily Cleanup",
    "schedule": "0 2 * * *",
    "scheduleEnabled": true,
    "resource": "res-abc"
}
```

#### Response

**Example Response:**

```json
{
    "status": "saved"
}
```

### Delete Job

`DELETE /v1/clients/:clientId/jobs/:jobId`

**Description:** Deletes a specific job configuration from the client.

#### Path Parameters

| Parameter  | Type   | Required | Description                    |
| :--------- | :----- | :------- | :----------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client.        |
| `jobId`    | string | **Yes**  | The UUID of the job to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

### Run Action

`POST /v1/clients/:clientId/jobs/:jobId/run`

**Description:** Manually triggers the execution of a job immediately.

#### Path Parameters

| Parameter  | Type   | Required | Description                 |
| :--------- | :----- | :------- | :-------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client.     |
| `jobId`    | string | **Yes**  | The UUID of the job to run. |

#### Response

**Example Response:**

```json
{
    "status": "triggered",
    "runId": "run-xyz-789"
}
```

---

## 🗄 Resources

### List Resources

`GET /v1/resources`

**Description:** Retrieves all configured managed resources.

#### Response

**Example Response:**

```json
[
    {
        "id": "res-abc",
        "name": "Primary Database",
        "type": "database",
        "status": "online"
    }
]
```

### Get Resource Status

`GET /v1/resources/:resourceId/status`

**Description:** Checks and returns the current connectivity status of a resource.

#### Response

**Example Response:**

```json
{
    "status": "online"
}
```

### Create Resource

`POST /v1/resources`

**Description:** Adds a new managed resource configuration.

#### Request Body

| Field  | Type   | Required | Description          |
| :----- | :----- | :------- | :------------------- |
| `name` | string | **Yes**  | Name of the resource.|
| `type` | string | **Yes**  | Type of the resource.|

**Example Request:**

```json
{
    "name": "Primary Database",
    "type": "database"
}
```

#### Response

**Example Response:**

```json
{
    "id": "res-abc",
    "status": "created"
}
```

### Update Resource

`PUT /v1/resources/:resourceId`

**Description:** Updates an existing resource configuration.

#### Path Parameters

| Parameter    | Type   | Required | Description                     |
| :----------- | :----- | :------- | :------------------------------ |
| `resourceId` | string | **Yes**  | UUID of the resource to update. |

#### Request Body

_Same fields as Create Resource._

#### Response

**Example Response:**

```json
{
    "status": "updated"
}
```

### Delete Resource

`DELETE /v1/resources/:resourceId`

**Description:** Deletes a resource configuration.

#### Path Parameters

| Parameter    | Type   | Required | Description                     |
| :----------- | :----- | :------- | :------------------------------ |
| `resourceId` | string | **Yes**  | UUID of the resource to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

---

## 🎫 Registration Tokens

### List Tokens

`GET /v1/tokens`

**Description:** Lists active client registration tokens.

#### Response

**Example Response:**

```json
[
    {
        "token": "token-123",
        "created_at": "2023-10-27T10:00:00Z",
        "expires_at": "2023-10-27T14:00:00Z",
        "used_at": null
    }
]
```

### Create Token

`POST /v1/tokens`

**Description:** Generates a new short-lived token for client registration.

#### Response

**Example Response:**

```json
{
    "token": "a1b2c3d4e5...",
    "expiresAt": "2023-10-27T14:45:00.000Z"
}
```

### Delete Token

`DELETE /v1/tokens/:token`

**Description:** Manually invalidates/deletes a registration token.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| :-------- | :----- | :------- | :-------------------------- |
| `token`   | string | **Yes**  | The token string to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

### Register Client (Public)

`POST /v1/register`

**Description:** Public endpoint used by the client agent to register itself.

#### Request Body

| Field      | Type   | Required | Description                                 |
| :--------- | :----- | :------- | :------------------------------------------ |
| `token`    | string | **Yes**  | A valid, unused registration token.         |
| `clientId` | string | **Yes**  | CSS-generated UUID for the client identity. |
| `hostname` | string | No       | Hostname of the client device.              |

**Example Request:**

```json
{
    "token": "a1b2c3d4e5...",
    "clientId": "550e8400-...",
    "hostname": "backup-client-01"
}
```

#### Response

**Example Response:**

```json
{
    "token": "f8a9b2...",
    "clientId": "550e8400-..."
}
```

---

## 🛠 Settings & Maintenance

### Get Cleanup Settings

`GET /v1/settings/cleanup`

**Description:** Retrieves current automated cleanup and retention settings.

#### Response

**Example Response:**

```json
{
    "keepLast": 10,
    "keepDaily": 7,
    "keepWeekly": 4,
    "keepMonthly": 12
}
```

### Update Cleanup Settings

`PUT /v1/settings/cleanup`

**Description:** Updates the automated cleanup and retention parameters.

### Run Maintenance

`POST /v1/settings/cleanup`

**Description:** Manually triggers the cleanup/maintenance task based on current settings.

---

## 🔌 WebSockets

### Dashboard Connection

`GET /api/ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time updates.

#### Query Parameters

| Parameter | Type   | Required | Description                     |
| :-------- | :----- | :------- | :------------------------------ |
| `token`   | string | **Yes**  | Valid JWT authentication token. |

#### Events (Server -> Client)

| Event            | Payload Structure                                                     | Description                        |
| :--------------- | :-------------------------------------------------------------------- | :--------------------------------- |
| `CLIENTS_UPDATE` | `Client[]`                                                            | Full list of clients and statuses. |
| `JOB_UPDATE`     | `{ clientId: string, job: StatusUpdatePayload }`                      | Updates for running jobs.          |
| `LOG_UPDATE`     | `{ clientId: string, jobId: string, output: string, stream: string }` | Live log output.                   |

### Agent Connection

`GET /ws`

**Description:** WebSocket endpoint for client agents. Requires an active `authToken`.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0"
}
```

**`SYNC_HISTORY`**
**Description:** Delta-load of job history from agent to server.
**Payload:**

```json
{
    "history": [
        {
            "id": "run-uuid",
            "jobConfigId": "job-uuid",
            "name": "job-name",
            "type": "backup",
            "status": "success",
            "startTime": "ISO-TIMESTAMP",
            "endTime": "ISO-TIMESTAMP",
            "exitCode": 0,
            "stdout": "...",
            "stderr": "..."
        }
    ]
}
```

**`STATUS_UPDATE`**
**Description:** Job status update from agent.
**Payload:**

```json
{
    "id": "run-uuid",
    "name": "job-name",
    "status": "running", // or "success", "failed"
    "type": "backup", // or "restore"
    "start_time": "ISO-TIMESTAMP",
    "end_time": "ISO-TIMESTAMP", // optional
    "exit_code": 0, // optional
    "stdout": "output...", // optional
    "stderr": "errors..." // optional
}
```

**`LOG_UPDATE`**
**Description:** Real-time log streaming from agent.
**Payload:**

```json
{
    "jobId": "run-uuid",
    "output": "log line content\n",
    "stream": "stdout" // or "stderr"
}
```

#### Server -> Client Events

**`AUTH_SUCCESS`**
**Payload:**

```json
{
    "lastSyncTime": "ISO-TIMESTAMP"
}
```

**`AUTH_FAILURE`**
**Payload:**

```json
{
    "error": "Reason for failure"
}
```

**`RUN_BACKUP`**
**Description:** Instruction to run a backup job.
**Payload:**

```json
{
    "runId": "new-run-uuid",
    "jobId": "configured-job-uuid"
}
```

**`RUN_RESTORE`**
**Description:** Instruction to run a restore job.
**Payload:**

```json
{
  "runId": "new-run-uuid",
  "snapshot": "snapshot-name",
  "targetPath": "/restore/path",
  "repository": { ...Repository object... },
  "archives": ["root.pxar"]
}
```

**`JOB_LIST_CONFIG`**
**Description:** Server requests the list of configured jobs.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```

**`JOB_SAVE_CONFIG`**
**Description:** Server instructs agent to save/update a job.
**Payload:**

```json
{
  "requestId": "req-uuid",
  "job": { ...Job config object... }
}
```

**`JOB_DELETE_CONFIG`**
**Description:** Server instructs agent to delete a job.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "jobId": "job-uuid"
}
```

**`HISTORY`**
**Description:** Server requests job history.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```

**`FS_LIST`**
**Description:** Server requests file system listing.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "path": "/path/to/list"
}
```

**`GET_VERSION`**
**Description:** Server requests agent version.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```
