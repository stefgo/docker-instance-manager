# Installation & Setup

## Prerequisites

- **Node.js**: v22.x or higher
- **npm**: v10.x or higher
- **Docker** & **Docker Compose** (optional, for container-based setup)

## Project Structure

The project is organized as a monorepo:

- `client`: The management agent (Node.js/TypeScript)
- `server/backend`: The API server (Fastify)
- `server/frontend`: The web dashboard (React/Vite)
- `shared`: Shared types and utilities

## Installation (Local)

1.  **Clone repository:**

    ```bash
    git clone <repo-url>
    cd docker-instance-manager
    ```

2.  **Install dependencies:**
    Run this command in the root directory to install all dependencies for all workspaces:

    ```bash
    npm install
    ```

3.  **Build Shared Library:**
    Before the client or server can start, the shared library must be built:
    ```bash
    npm run build -w shared
    ```

## Starting (Development)

### Variant A: Local (without Docker)

You can start the client and server separately.

**Start Server:**
This starts the backend and the frontend (if configured):

```bash
npm run dev:server
```

_The server runs on <http://localhost:3000> by default._

**Start Client:**

```bash
npm run dev:client
```

### Variant B: Docker Compose

For a complete development environment including isolation:

```bash
docker compose -f compose.dev.yml up -d --build
```

- **Server**: <http://localhost:3000> (Supports both x86_64 and ARM64)
- View logs: `docker compose -f compose.dev.yml logs -f`

## Configuration

The behavior of the client and server can be controlled via environment variables.

### Logging

| Variable     | Values                             | Default       | Description                                                                                              |
| :----------- | :--------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`  | `debug`, `info`, `warn`, `error`   | `info`        | Controls the verbosity of the logs.                                                                      |
| `LOG_FORMAT` | `pretty`, `json`                   | _auto_        | `pretty` for single-line, colored logs (default in Dev). `json` for structured output (default in Prod). |
| `SERVER_URL` | URL (e.g., `wss://localhost:3000`) | _from config_ | (Client only) Overrides the server URL from `config.yaml`.                                               |
| `NODE_ENV`   | `development`, `production`        | `development` | Controls general behavior like logging defaults.                                                         |

**Examples:**

```bash
# Force debug level and JSON output
LOG_LEVEL=debug LOG_FORMAT=json npm run dev -w server/backend
```

### Configuration Files (`config.yaml`)

In addition to environment variables, there are configuration files for specific settings.

#### Client Config (`client/config.yaml`)

This file is created automatically or can be created manually.

| Key             | Description                                                             |
| :-------------- | :---------------------------------------------------------------------- |
| `serverUrl`     | URL to the management server (e.g., `wss://manager:3000/ws`).           |
| `clientId`      | Unique ID of the client (generated automatically).                      |
| `executable`    | Path to the management executable.                                      |
| `retentionTime` | Number of days to keep job history and schedule states (default: `90`). |

#### Server Config (`server/config.yaml`)

This file contains advanced settings for the server, specifically for authentication.

| Key         | Sub-Key         | Description                             |
| :---------- | :-------------- | :-------------------------------------- |
| `oidc`      | `enabled`       | Enables/Disables (true/false) OIDC.     |
|             | `issuer`        | OIDC Issuer URL.                        |
|             | `client_id`     | OIDC Client ID.                         |
|             | `client_secret` | OIDC Client Secret.                     |
|             | `redirect_uri`  | OIDC Redirect URI.                      |
| `jwtSecret` | (Root)          | Generated automatically if not present. |
