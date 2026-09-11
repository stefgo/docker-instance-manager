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
| `clientId`   | UUID of this client, issued by the server at registration. Leave empty.        |
| `logLevel`   | Log verbosity for the client agent.                                            |
| `serverUrl`  | HTTP(S) URL of the management server (e.g., `https://manager.example.com`).   |
| `authToken`  | Permanent authentication token. Populated automatically after registration.    |
| `allowSelfSignedCertificates` | Accept a server certificate that does not validate (self-signed), for registration and the WebSocket connection. Default `false`. |
| `allowedNetworks` | IPv4 addresses or CIDR networks the **server** may dial this agent from, checked on `/ws/register` and `/ws/agent`. Empty (default) allows every address. The local web UI is not restricted by it. An invalid entry stops the agent with a log line naming it. |

#### Server Config (`server/config.yaml`)

Created automatically on first start. Contains advanced settings for authentication and security.

The server checks the file on every start. A value of the wrong type or format — `hsts: "yes"`, an invalid CIDR, `oidc.enabled: true` without an `issuer` — stops the start with exit code 1 and a log line that names the field:

```
Invalid config.yaml -- security.hsts: Invalid input: expected boolean, received string
```

Fix the value and start again. Unknown keys are kept and do not cause an error.

| Key                        | Sub-Key         | Description                                              |
| :------------------------- | :-------------- | :------------------------------------------------------- |
| `jwtSecret`                | —               | JWT signing secret. Auto-generated on first run.         |
| `oidc`                     | `enabled`       | Enables or disables OIDC login (`true`/`false`).         |
|                            | `issuer`        | OIDC Issuer URL.                                         |
|                            | `client_id`     | OIDC Client ID.                                          |
|                            | `client_secret` | OIDC Client Secret.                                      |
|                            | `redirect_uri`  | OIDC Redirect URI.                                       |
| `jwtExpiresIn`             | —               | JWT session lifetime (e.g. `"24h"`). Defaults to `"12h"`. Tokens always expire; the dashboard logs out when its token does. |
| `settings`                 | `retention_invalid_tokens_days` / `_count` | Retention policy for used/expired registration tokens. |
|                            | `image_version_cache_ttl_days` | Max age of a cached image update check before it's cleaned up (`0` disables). |
|                            | `image_version_cache_cleanup_orphans` | Remove cache entries whose image ref is no longer referenced (`true`/`false`). |
|                            | `image_version_cache_cleanup_interval_hours` | Automatic cache cleanup scheduler interval (`0` disables). |
| `security`                 | `allowed_networks` | IPv4 addresses or CIDR networks an agent may open `/ws/agent` from, for all agents alike. Empty (default) allows every address. |
|                            | `hsts`          | Send `Strict-Transport-Security` (default `false`). Enable only when the dashboard is served exclusively over HTTPS — browsers remember the header for months. Requires a restart. |

## First Login

On the first start, if no users exist in the database, the backend automatically creates an `admin` user with the password `admin`.

> **Change this password immediately after first login** via the user management UI or the `PUT /api/v1/users/:userId` endpoint.
> The server logs a warning on startup when it creates this account.

`POST /api/login` accepts at most 10 attempts per 15 minutes per client IP.

> **Reverse proxy:** the server runs with `trustProxy: true` and takes the client IP from
> `X-Forwarded-For`. That is correct behind Traefik, nginx or a similar proxy, which sets the
> header itself. Without such a proxy in front, a caller can send the header with any value
> and so appears under a different IP on every attempt — the login rate limit and the
> per-client IP checks then rely on a value the caller controls. Expose port 3000 only
> through a reverse proxy.

## Address Checks for Agent Connections

Three settings decide where an agent connection may come from. They answer different
questions:

| Setting | Scope | Question |
| :------ | :---- | :------- |
| `security.allowed_networks` (server `config.yaml`) | all agents | May *any* agent connect from this network? |
| Allowed IP or network (client editor, per inbound client) | one client | Does this connection come from where *this* client is allowed to be? |
| `allowedNetworks` (agent `config.yaml`) | one agent's listener | May the server dial this agent from this network? |

An empty network list means no restriction. A newly registered inbound client starts out
restricted to the address it registered from. In the client editor that value can be widened
to a network (`192.168.1.0/24`), or the check can be switched off for the client — the right
choice for a host whose address its environment assigns, such as a container on a bridge
network or DHCP without a reservation. Its token is then accepted from anywhere
`allowed_networks` permits.

The agent checks the socket peer (it has no `trustProxy`). Behind a reverse proxy, list the
proxy's address. With Docker port publishing the peer is normally the server's address, but a
userland proxy (for example Docker Desktop, or `127.0.0.1` published ports) shows up as the
bridge gateway instead — check the agent's log line `denied: not in allowedNetworks` for the
address that was actually seen. A wrong `allowedNetworks` can only be fixed on the agent host:
the connection one would fix it over is the one being refused.

## Health

Both images declare a `HEALTHCHECK`, and `compose.yaml` repeats it, so `docker ps` shows
`(healthy)` next to the containers:

```bash
curl -fsS http://localhost:3000/api/health   # server: process and database
curl -fsS http://localhost:3001/api/health   # agent: process only
```

- **The agent's check does not cover its server connection.** An agent that cannot reach the
  server is still running and watching Docker; whether it is connected is shown on its status
  page (`/api/status/connection`).
- An agent whose `config.yaml` disables the web server (`enableStatusPage: false`,
  `enableRegisterPage: false`, no inbound mode) has nothing on port 3001 to answer. Set
  `healthcheck: { disable: true }` for that service.
- **Docker does not restart an unhealthy container.** `restart: unless-stopped` reacts to a
  process exiting, not to its health. The state is for monitoring and for
  `depends_on: condition: service_healthy`.

## Security Headers

The server sends a Content-Security-Policy and the usual hardening headers (via
`@fastify/helmet`). The policy allows scripts only from the server itself, styles and
fonts additionally from Google Fonts, and WebSocket connections to the same host. If a
reverse proxy injects scripts or other resources into the dashboard, those are blocked.

`Strict-Transport-Security` is **off** unless `security.hsts: true` is set, because many
installations run on plain HTTP. Behind TLS, either enable it here or let the reverse proxy
send it.

## Upgrade Notes

### Agents check the server's certificate

The agent used to switch off certificate checks for its whole process on the first request
its web UI sent to the server. Registration against a self-signed server therefore always
worked, while the WebSocket connection afterwards worked only if that had happened since the
agent started. Certificates are now checked for registration and for the connection alike.

**Agents that talk to a server with a self-signed certificate need
`allowSelfSignedCertificates: true`** in their `config.yaml`; without it they log that the
certificate could not be verified and stay disconnected. Servers behind a certificate from a
public or otherwise trusted CA are not affected. Agent only.

### trusted_networks is gone, the per-client address is editable

`security.trusted_networks` no longer exists. It skipped the per-client address check for
agents connecting from a listed network, so a client whose address had changed still got in
from there — and `0.0.0.0/0` switched the check off for every client. The server now ignores
the key and logs a warning while it is still in `config.yaml`.

**A client whose current address differs from its stored one is refused at its next
reconnect.** Before upgrading, compare them:

```sql
SELECT id, hostname, inbound_registered_ip FROM clients WHERE connection_mode = 'inbound';
```

After the upgrade (the column is renamed to `inbound_allowed_ip` by migration 07), open each
affected client in the dashboard and either enter its new address or network, or untick
"Restrict connections to an IP address or network". Then remove `trusted_networks` from
`config.yaml`.

Also new: an outbound client's auth token is refused on the server's `/ws/agent`, and agents
accept an `allowedNetworks` list (empty by default, so nothing changes until it is set).
Server and agent can be updated independently.

### Input validation on the REST API

Every endpoint now checks its body or query and answers `400` with the offending field
named. The dashboard is not affected. Scripts against the API may be:

- `POST /api/login` without `username` or `password` answers `400` instead of `401`.
- `PUT /api/v1/settings/cleanup` rejects a `security` block, and `GET` no longer returns one.
  Network and HSTS settings are configured in `config.yaml` only.
- Invalid settings values (a non-numeric retention, a malformed cron expression) and manual
  auto-update entries without a container name are rejected instead of being stored or
  dropped silently.

Server only.

### config.yaml is checked on startup

The server validates `server/config.yaml` before it starts. A value of the wrong type or
format — `hsts: "yes"`, an invalid entry in `allowed_networks`, `oidc.enabled: true`
without `issuer`, an unknown `logLevel` — now stops the start with exit code 1 and a log
line naming the field, where it used to be accepted and misread later. Check the log after
upgrading; a valid file starts unchanged and is not rewritten. Server only.

### Session expiry

Every session token now carries an expiry (`jwtExpiresIn`, default `12h`). Tokens issued by
earlier versions had none; the server now refuses them once they are older than
`jwtExpiresIn`, and the dashboard discards them on load. **Every user has to log in once
after the upgrade.** Server only — agents are not affected.

### Setup PIN for agent registration

Registering an agent through its web UI (`http://<host>:3001/register`) now also asks for a
**setup PIN**. The agent prints it to its log when the web server starts
(`docker logs dim-client`) and after every successful registration. Scripts that call the
agent's `POST /api/register` directly have to send it as `pin`. `enableRegisterPage: false`
now disables that endpoint too, not only the page. Agent only — the server is not affected.

### Client ids are issued by the server

The server now generates the `clientId` at registration. It used to accept the id the agent
sent and upsert it, which let anyone holding a registration token take over an existing client.

- **Update the server first.** A new agent no longer sends a `clientId`; an old server refuses
  its first registration with `Missing clientId`. A new server accepts old agents.
- **No database migration.** Existing clients keep their ids, and registered agents keep
  connecting with their auth token as before — no re-registration is needed.
- **Re-registering an agent now creates a new client entry.** Previously re-registering with
  the same agent reused its row (display name, Docker state, auto-update enrollments). The old
  entry now stays behind offline; delete it in the UI.
- Agents no longer generate an id of their own on first start. Outbound clients added from now
  on receive the server's id during the handshake. An id already in an agent's `config.yaml`
  is left as it is — the agent does not use it to connect.
