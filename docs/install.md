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

_The client's local web UI runs on `http://localhost:3001` unless `listenPort` or `DIM_CLIENT_PORT` moves it._

### Variant B: Docker Compose

For a complete, isolated development environment:

```bash
docker compose -f compose.dev.yaml up -d --build
```

| Service      | Port   | Description                          |
| :----------- | :----- | :----------------------------------- |
| `server-dev` | `3000` | Backend in watch mode; serves the built frontend. |
| `client-dev` | `3001` | Client agent (watch mode).           |

View logs:

```bash
docker compose -f compose.dev.yaml logs -f
```

## Container Images

The server and the agent are published as multi-arch images (`linux/amd64`, `linux/arm64`):
`ghcr.io/stefgo/dim-server` and `ghcr.io/stefgo/dim-client`.

| Tag | What it is |
| :-- | :--------- |
| `latest` | The last release. Moves only when a release is published. **Use this one** unless you have a reason not to. |
| `1.2.0` | A specific release. Pin it to make an upgrade a decision rather than a side effect of `docker compose pull`. |
| `1.2` | The newest patch release of that minor version. |
| `main` | The current state of the `main` branch — not a release, and it can be ahead of `latest`. |
| `dev` | The state of development. Expect it to break. |
| `sha-<short>` | The build of one commit on `main` or `dev`. |

An image is tagged only after CI has started it and it answered its health check.

## Configuration

### Environment Variables

| Variable      | Values                           | Default       | Description                                                                   |
| :------------ | :------------------------------- | :------------ | :---------------------------------------------------------------------------- |
| `LOG_LEVEL`   | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | `info` | Controls log verbosity. Wins over `logLevel` in `config.yaml`. |
| `LOG_FORMAT`  | `pretty`, `json`                 | _auto_        | `pretty` for colored single-line logs (default in dev), `json` for prod.      |
| `DIM_SERVER_PORT` | `1`–`65535`                  | `3000`        | Port the server listens on; wins over `port` in `config.yaml`. An unusable value ends the start. The container's health check reads it too. |
| `NODE_ENV`    | `development`, `production`      | `development` | Picks the log format when `LOG_FORMAT` is unset (`production` → JSON).        |
| `DIM_CLIENT_PORT` | `1`–`65535`                  | `3001`        | _(Client only)_ Port of the local web server; wins over `listenPort` in `config.yaml`. An unusable value ends the start. |
| `DIM_CLIENT_DATA_DIR` | path                     | `/app/client/data` | _(Client only)_ Where the agent keeps its own state: the identity it was issued at registration, the auto-update policy, its schedule state and unacknowledged activity events. Losing it means registering the agent again. Set it when the agent runs outside the shipped `compose.yaml`. |
| `DIM_REGISTRATION_SECRET` | string                 | _unset_       | _(Client only)_ Outbound mode: a secret the **Add Client** wizard accepts in place of the setup PIN from the agent's log, for a rollout where nobody reads that log. Remove it once the agent is registered. |
| `DIM_REGISTRATION_SECRET_FILE` | path              | _unset_       | _(Client only)_ The same, read from a file (e.g. `/run/secrets/…`). Setting both variables, or a file that cannot be read or is empty, ends the start. |

**Example:**

```bash
LOG_LEVEL=debug LOG_FORMAT=json npm run dev -w server/backend
```

### Configuration Files (`config.yaml`)

#### Client Config (`client/config.yaml`)

Created automatically during registration, or can be set up manually using `client/config.example.yaml` as a template. It holds what you set; the identity the server issues at
registration lives in `identity.json` in the agent's data directory (`DIM_CLIENT_DATA_DIR`),
not here.

An agent the server dials (outbound mode) needs no entry here to be registered: enter the
**Setup PIN** from `docker logs dim-client` in the dashboard's **Add Client** wizard, or give
the agent `DIM_REGISTRATION_SECRET` and enter that instead (see
[Outbound registration](client.md#outbound-registration)). A `registrationSecret` in this
file is no longer read.

| Key          | Description                                                                    |
| :----------- | :----------------------------------------------------------------------------- |
| `logLevel`   | Log verbosity for the client agent.                                            |
| `serverUrl`  | HTTP(S) URL of the management server (e.g., `https://manager.example.com`). Absent in outbound mode. |
| `dockerSocket` | Path to the Docker socket. Auto-detected when unset.                          |
| `listenPort` | Port of the local web server (default `3001`); `DIM_CLIENT_PORT` wins over it. |
| `enableStatusPage` / `enableRegisterPage` | Serve the status page and the registration page with `POST /api/register` (both default `true`). |
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
| `jwtExpiresIn`             | —               | JWT session lifetime (e.g. `"24h"`). Defaults to `"12h"`. Tokens always expire; the session cookies expire with them, and the dashboard logs out when they do. |
| `settings`                 | `retention_invalid_tokens_days` / `_count` | Retention policy for used/expired registration tokens. |
|                            | `image_version_cache_ttl_days` | Max age of a cached image update check before it's cleaned up (`0` disables). |
|                            | `image_version_cache_cleanup_orphans` | Remove cache entries whose image ref is no longer referenced (`true`/`false`). |
|                            | `image_version_cache_cleanup_interval_hours` | Automatic cache cleanup scheduler interval (`0` disables). |
|                            | `image_update_check_interval_seconds` | Interval of the registry update check sweep (`0`, the default, disables). |
|                            | `container_auto_update_cron` | Default auto-update schedule hosts and projects inherit. Empty: only those with a schedule of their own take part. |
|                            | `container_auto_update_label` / `_delay_label` | Label that enrols a container (default `dim.auto-update=true`) and label holding its delay in days (default `dim.auto-update-delay`). |
|                            | `notification_retention_days` / `_count` / `notification_cleanup_interval_hours` | Retention of the activity list (defaults 90 days, at least 500 kept, every 24 h). |
| `logLevel`                 | —               | pino log level; `LOG_LEVEL` wins when set.               |
| `port`                     | —               | Listen port (default `3000`); `DIM_SERVER_PORT` wins when set. The published port: `EXPOSE`, the compose port mapping and every agent's `serverUrl` have to follow it. |
| `security`                 | `allowed_networks` | IPv4 addresses or CIDR networks an agent may open `/ws/agent` from, for all agents alike. Empty (default) allows every address. |
|                            | `hsts`          | Send `Strict-Transport-Security` (default `false`). Enable only when the dashboard is served exclusively over HTTPS — browsers remember the header for months. Requires a restart. |
|                            | `allow_self_signed_agent_certificates` | Accept a certificate this server cannot verify when dialling an outbound agent over `wss://` (default `false`). Applies to every outbound agent alike, and only where the target address is `wss://`. |

## First Login

On the first start, if no users exist in the database, the backend automatically creates an `admin` user with the password `admin`.

![The DIM sign-in form](assets/screenshots/login-dark.png)

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

The editor knows the address of that client's last successful connect and warns when the value
about to be saved would not let it back in. Without that warning the mistake surfaces only at
the agent's next reconnect, with nothing but an offline client to go on.

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
docker compose exec dim-client node -e "fetch('http://127.0.0.1:3001/api/health').then(r => r.text()).then(console.log)"   # agent: process only
```

The agent's route exists for the `HEALTHCHECK` alone: it is served only in the container
image and answers only loopback, so from the host it is asked inside the container.

- **The agent's check does not cover its server connection.** An agent that cannot reach the
  server is still running and watching Docker; whether it is connected is shown on its status
  page (`/api/status/connection`).
- The route is there whatever `config.yaml` disables: with both pages off and no outbound
  mode the agent still starts its web server for it, bound to `127.0.0.1`. A `curl` from
  another machine, or from the host under a port mapping, gets a `404` — that is the
  loopback rule, not a broken agent.
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

## TLS to an Outbound Agent

An outbound agent is dialled by the server, and the agent's auth token travels in the
`/ws/agent` query string. Over plain `ws://` that token is readable by anything on the path,
which matters as soon as the agent sits somewhere the operator does not control end to end.

Two settings, one on each side:

1. The agent serves TLS — a `tls` block naming a certificate and key in its `config.yaml`
   (see [client.md](client.md)), or a reverse proxy terminating TLS in front of it.
2. The client's **target address** says so: `wss://host:port` instead of `host:port`, set in
   the client editor or when the client is added.

They have to agree. An address written `wss://` against an agent serving plain HTTP fails to
connect, and so does a bare address against an agent serving TLS. Addresses stored before
this existed keep working unchanged — a bare `host:port` still means `ws://`.

By default the server verifies the agent's certificate, so a wrong or expired one is a failed
connection rather than a silent one. An agent on a home network usually carries a self-signed
certificate, and running a CA for a handful of hosts is more than that warrants:

```yaml
security:
    allow_self_signed_agent_certificates: true
```

It applies to every outbound agent alike and only where the address is `wss://` — a plaintext
target has no certificate to check. This is the mirror image of `allowSelfSignedCertificates`
in the agent's own configuration, which is the same decision for the other direction of the
same link.

## Upgrade Notes

### Outbound agents register with the setup PIN

`registrationSecret` in the agent's `config.yaml` is no longer read; an agent that still has it
logs a warning and ignores it. The **Add Client** wizard now asks for the agent's **setup PIN**
(`docker logs dim-client`) when the server connects to the agent. For an unattended rollout
set `DIM_REGISTRATION_SECRET` or `DIM_REGISTRATION_SECRET_FILE` on the agent and enter that
value instead. Agents that are already registered are not affected. An agent of an older
version still needs `registrationSecret`; the wizard says so when it meets one.

### The agent's identity moved out of config.yaml

`clientId` and `authToken` are no longer kept in the agent's `config.yaml`. They are what the
server issues at registration — the operator never writes them — and they now live in
`identity.json` in the agent's data directory, where the write is atomic and the file is not
one somebody also edits by hand.

- **Nothing to do.** An agent that still has the two keys in its `config.yaml` migrates itself
  at the next start: the pair is written to `identity.json`, and only once that worked are the
  keys removed from `config.yaml`, together with the comments that described them. The rest of
  the file — your comments, your order — is left as it was.
- **The data directory has to persist.** It already had to (the auto-update policy lives
  there), but losing it now also means registering the agent again. In the shipped
  `compose.yaml` it is the `client-data` named volume; see
  [The agent needs a persistent data directory](#the-agent-needs-a-persistent-data-directory).
- **`config.yaml` is now validated as a whole** on every start. A value of the wrong type or
  format stops the agent with a log line naming the field. The two lenient settings stay
  lenient: a `logLevel` or an `allowSelfSignedCertificates` that is not a valid value is
  ignored with a warning rather than being fatal.
- The agent still writes back to `config.yaml`, but only two things: the `serverUrl` of a
  registration made through the web UI, and the `registrationSecret` once it has been used.
  A registration the agent could not store is now reported on the register page instead of
  looking like a success.

### Auto-update runs in the agents — update the agents first

The server no longer performs auto-update. It resolves the schedule inheritance, sends every
agent the expressions it is to act on, and reads back what each of them did; the cron sweep,
the registry calls on a host's behalf and the per-container `image:update` actions are gone
from it.

- **Update the agents first, then the server.** A server of this build runs no sweep, so a
  host whose agent is older stops being auto-updated the moment the server is upgraded — the
  old agent has nothing to run it with and nobody left to run it for it. Its connection is
  still accepted and it stays fully manageable, which is how you update it.
- **Which agents can do it** shows in the "Capabilities" column of the client list
  (`auto-update`). The "Agent too old" notices and the `client.autoupdate.unsupported`
  activity entry that accompanied the switch have since been removed again, together with the
  other handling of agents from before autonomous auto-update.
- **The agent needs its data volume.** Without it the agent loses the policy on every recreate
  and runs nothing until the server sends a new one — see the note below.
- **Two settings are gone.** `container_auto_update_refresh_check` no longer exists: an agent
  asks the registry on every run, so there is no cached path to choose. Leaving the key in
  `config.yaml` is harmless; it is ignored. `container_auto_update_cron` stays, now purely as
  the default that hosts and projects inherit.
- **"Run Auto-Update" is a command, not a sweep.** `POST /api/v1/clients/:clientId/auto-update/run`
  asks one host to run and returns at once; what came of it arrives as its `autoupdate.run`
  event. The dashboard no longer offers it — neither for the whole fleet nor, since a later
  release, as a row action in the client list.
- **No database migration**, and nothing to re-register. The record of "who ran when" is the
  activity list itself, so it starts empty and fills with the first runs after the upgrade.

### The agent needs a persistent data directory

The agent now keeps state of its own — the auto-update policy the server sends it, its
schedule state and activity events the server has not acknowledged yet — under
`/app/client/data`. The shipped `compose.yaml` mounts the named volume `client-data` there,
and **an agent without it loses that state on every recreate, which includes every
self-update**: it would come back without its policy and wait for the server to send a new
one. If you run the agent from a compose file of your own, add the volume:

```yaml
    dim-client:
        volumes:
            - client-data:/app/client/data

volumes:
    client-data:
```

`DIM_CLIENT_DATA_DIR` moves the directory for an agent that does not run in a container.
The identity the server issues at registration lives here too, in `identity.json` — losing
this directory means registering the agent again. `config.yaml` keeps what the operator
wrote.

### The client editor warns before an allowed address locks the agent out

The server records the address an inbound agent last authenticated from
(`clients.inbound_last_ip`, migration 09 — one nullable column, no backfill, no
re-registration). Nothing decides on it: it is written only once the allowed-address check has
passed, so it is always an address that was let in, and it is exposed read-only as
`inboundLastIp`.

The client editor measures the allowed address under the cursor against it and says outright
when saving would refuse the agent at its next reconnect. That is a note, not an error — the
value is still saved if you mean it, because an agent may have moved on purpose. The column
is empty until a client connects once, and for outbound clients it stays empty: there the
server is the calling party, and the address it dials is `outbound_target_address`.

### Clients are added through one wizard

The dashboard's "Add Outbound Client" dialog and the two "Generate New Token" buttons are
replaced by a single **Add Client** wizard: step 1 picks which side opens the connection,
step 2 is the branch that follows from it. Tokens are issued there and nowhere else.

A registration token can now carry a display name and an allowed IP or network for the
client it will create (migration 08, both columns nullable). Without them the behaviour is
unchanged — the agent's hostname names the client, and the address it registers from becomes
its allowed address. `POST /api/v1/tokens` takes an optional body for those two fields; a
call without a body works as before, so **scripts keep working**. `POST /api/v1/register` is
unchanged, so **agents do not need updating.**

### The agent port is configurable, the target address editable

`listenPort` in the agent's `config.yaml` (default 3001) and `DIM_CLIENT_PORT`, which wins
over it, move the agent's local web server. Worth knowing under host networking, where the
compose `ports:` mapping does not apply. An unusable value ends the agent's start rather
than falling back silently.

On the server, `PUT /api/v1/clients/:clientId` now accepts `outboundTargetAddress`, and the
client editor offers it for outbound clients — a host that moved no longer has to be deleted
and re-registered. Saving closes the open socket and dials the new address at once. The
value is validated (`host` or `host:port`, no scheme, path or credentials) **only when it is
written**, so an address stored before this check keeps working until it is edited. No
migration, and server and agent can be updated independently.

### Versions come from releases

Versions are now created by a release workflow instead of hand-made tags. The version the
dashboard shows and an agent reports has no leading `v` any more (`1.0.0`, not `v0.0.5`); an
image built from a branch shows `<branch>-<sha>`. Nothing compares the string, so server and
agents can still be updated independently.

**The `latest` and `0.0.3`–`0.0.5` images published before this change are broken in the
registry**: their platform images are gone, and `docker pull` fails on them. Until the first
release under the new model, pull `main`.

### The dashboard session is an httpOnly cookie

The session token no longer reaches the browser's JavaScript. `POST /api/login` and the OIDC
callback set it as the httpOnly cookie `dim_session` (plus a readable flag cookie `dim_auth`
without a secret) instead of returning it in the body or appending it to the redirect URL.
The dashboard WebSocket authenticates with the same cookie; `/ws/dashboard?token=` is no
longer accepted. New endpoints: `GET /api/v1/me` and `POST /api/auth/logout`
(see [api.md](api.md#logout)).

- **Every user has to log in once after the upgrade.** A token stored by the old dashboard
  is not taken over. (Later builds no longer delete that stale `localStorage` entry; it is
  unused and harmless.)
- **Scripts against the API:** `POST /api/login` answers `{ "success": true }` and no longer
  contains `token`. Read the value of the `dim_session` cookie from the `Set-Cookie` header
  and send it either as that cookie or as `Authorization: Bearer <value>`, which keeps
  working on every endpoint.
- **Reverse proxy with TLS:** the cookies are marked `Secure` when the request arrived over
  HTTPS. Behind a proxy the server sees that through `X-Forwarded-Proto`. Traefik sends it by
  default; nginx needs `proxy_set_header X-Forwarded-Proto $scheme;`. Without the header,
  login still works, but the cookies go without `Secure`.
- **OIDC:** the callback now redirects to `/` instead of `/login?token=…`. The provider's
  redirect URI (`oidc.redirect_uri`) does not change.

Server only; the frontend ships inside the server image. Agents are not affected: they keep
authenticating on `/ws/agent` with their auth token.

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
the key. (The startup warning about it was dropped in a later build; the key is kept in the
file like any other unknown key.)

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
- Invalid settings values (a non-numeric retention, a malformed cron expression) are rejected
  instead of being stored or dropped silently.

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

### An agent connects with its id and its token

`/ws/agent` no longer resolves a client by its auth token alone. The agent presents
`clientId` **and** `token`, and both have to name the same row; a connection carrying only
one of them is closed with `4001 Authentication required`. The same check runs in the other
direction: when the server dials an outbound agent, it names the id it is dialling, and the
agent refuses a caller that does not match the id it was registered under — a target address
pointed at the wrong host would otherwise hand that host somebody else's Docker actions.

- **Update the server and the agents together.** An agent of an older build sends no
  `clientId` and is refused. There is no transitional mode: the gap the check closes is
  exactly the one a fallback to the token would leave open.
- **No database migration**, and **inbound clients need no re-registration**: their ids
  already match on both sides.
- **Outbound clients registered before ids were issued by the server have to be set right.**
  Those agents generated an id of their own, so it differs from the one the server knows them
  by. Delete the client in the dashboard and add it again. (Older builds stored the id in the
  agent's `config.yaml`, where it could be corrected by hand; it now lives in `identity.json`
  in the agent's data directory and is not meant to be edited.)
- A registration answer without a `clientId` is refused by the agent (`RegistrationRequestSchema`),
  so an old server can no longer register a new agent.
