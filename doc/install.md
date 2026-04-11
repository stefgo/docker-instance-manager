# Installation & Setup

## Prerequisites

- **Node.js**: v22.x or higher
- **npm**: v10.x or higher
- **Docker** & **Docker Compose** (optional, for container-based setup)

## Project Structure

The project is organized as a monorepo with npm workspaces:

| Workspace          | Description                                      |
| :----------------- | :----------------------------------------------- |
| `shared`           | Shared types, schemas (Zod), and constants.       |
| `client`           | The management agent (Node.js/TypeScript).        |
| `server/backend`   | The API and WebSocket server (Fastify).           |
| `server/frontend`  | The web dashboard (React/Vite).                  |

## Installation (Local)

1. **Clone the repository:**

    ```bash
    git clone <repo-url>
    cd docker-instance-manager
    ```

2. **Install all dependencies:**
    Run this command in the root directory to install all workspace dependencies at once:

    ```bash
    npm install
    ```

3. **Build the shared library:**
    The `shared` package must be built before any other workspace can start:

    ```bash
    npm run build -w shared
    ```

## Starting (Development)

### Variant A: Local (without Docker)

**Start the backend server:**

```bash
npm run dev:server
```

_The server API runs on `http://localhost:3000` by default._

**Start the frontend dev server** (optional, for hot-reloading):

```bash
npm run dev:frontend
```

**Start the client agent:**

```bash
npm run dev:client
```

_The client's local web UI runs on `http://localhost:3001`._

### Variant B: Docker Compose

For a complete, isolated development environment:

```bash
docker compose -f compose.dev.yaml up -d --build
```

| Service      | Port   | Description                          |
| :----------- | :----- | :----------------------------------- |
| `server-dev` | `3000` | Backend + frontend (watch mode).     |
| `client-dev` | `3001` | Client agent (watch mode).           |

View logs:

```bash
docker compose -f compose.dev.yaml logs -f
```

## Configuration

### Environment Variables

| Variable      | Values                           | Default       | Description                                                                   |
| :------------ | :------------------------------- | :------------ | :---------------------------------------------------------------------------- |
| `LOG_LEVEL`   | `debug`, `info`, `warn`, `error` | `info`        | Controls log verbosity.                                                       |
| `LOG_FORMAT`  | `pretty`, `json`                 | _auto_        | `pretty` for colored single-line logs (default in dev), `json` for prod.      |
| `NODE_ENV`    | `development`, `production`      | `development` | Controls log defaults and other environment-specific behaviors.               |
| `SERVER_URL`  | URL (e.g., `http://server:3000`) | _from config_ | _(Client only)_ Overrides the server URL from `config.yaml`.                  |
| `DISABLE_WEB_UI` | `true`                        | _unset_       | _(Client only)_ Disables the local web server on port 3001.                   |

**Example:**

```bash
LOG_LEVEL=debug LOG_FORMAT=json npm run dev -w server/backend
```

### Configuration Files (`config.yaml`)

#### Client Config (`client/config.yaml`)

Created automatically during registration, or can be set up manually using `client/config.example.yaml` as a template.

| Key          | Description                                                                    |
| :----------- | :----------------------------------------------------------------------------- |
| `clientId`   | Unique UUID for this client. Generated automatically if empty.                 |
| `logLevel`   | Log verbosity for the client agent.                                            |
| `serverUrl`  | HTTP(S) URL of the management server (e.g., `https://manager.example.com`).   |
| `authToken`  | Permanent authentication token. Populated automatically after registration.    |

#### Server Config (`server/config.yaml`)

Created automatically on first start. Contains advanced settings for authentication and security.

| Key                        | Sub-Key         | Description                                              |
| :------------------------- | :-------------- | :------------------------------------------------------- |
| `jwtSecret`                | —               | JWT signing secret. Auto-generated on first run.         |
| `oidc`                     | `enabled`       | Enables or disables OIDC login (`true`/`false`).         |
|                            | `issuer`        | OIDC Issuer URL.                                         |
|                            | `client_id`     | OIDC Client ID.                                          |
|                            | `client_secret` | OIDC Client Secret.                                      |
|                            | `redirect_uri`  | OIDC Redirect URI.                                       |
| `jwtExpiresIn`             | —               | JWT session lifetime (e.g. `"24h"`). Unset ⇒ non-expiring. |
| `settings`                 | `retention_invalid_tokens_days` / `_count` | Retention policy for used/expired registration tokens. |
|                            | `image_version_cache_ttl_days` | Max age of a cached image update check before it's cleaned up (`0` disables). |
|                            | `image_version_cache_cleanup_orphans` | Remove cache entries whose image ref is no longer referenced (`true`/`false`). |
|                            | `image_version_cache_cleanup_interval_hours` | Automatic cache cleanup scheduler interval (`0` disables). |
| `security`                 | `allowed_networks` | CIDR list of networks allowed to register agents.     |
|                            | `trusted_networks` | CIDR list of networks exempt from per-client IP check. |

## First Login

On the first start, if no users exist in the database, the backend automatically creates an `admin` user with the password `admin`.

> **Change this password immediately after first login** via the user management UI or the `PUT /api/v1/users/:userId` endpoint.
