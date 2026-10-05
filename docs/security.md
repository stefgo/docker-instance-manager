# Security

An agent controls its host's Docker socket, and the server controls every agent. This page
lists what protects that chain and what you have to set up yourself.

## Checklist

- The `admin` / `admin` password is changed ([Quick Start](quickstart.md#2-sign-in)).
- The server is reachable only through a reverse proxy with TLS, and that proxy is listed in
  `security.trusted_proxies` ([below](#reverse-proxy)).
- Agents that the server dials outside a trusted network serve TLS ([below](#tls)).
- The agents' data volumes are readable only by root — they hold each agent's auth token.
- `enableRegisterPage: false` on agents that will not be registered again.
- The agent container runs with the restrictions of the shipped `compose.yaml`
  ([below](#what-the-agent-container-may-do)).

## Sign-in

- Local accounts (bcrypt) and [OIDC](configuration.md#oidc-single-sign-on), selectable per
  user.
- Sessions are an httpOnly cookie that expires after `jwtExpiresIn` (default 12 h).
  Changing a user's password or auth methods, or deleting the user, ends all of that
  user's sessions at once, open dashboards included.
- `POST /api/login` accepts at most **10 attempts per 15 minutes** per client IP.

## Reverse proxy

The server believes `X-Forwarded-For` and `X-Forwarded-Proto` only from the proxies listed in
`security.trusted_proxies` (or `DIM_TRUSTED_PROXIES`). The list is empty by default, so the
client address is the connection's own and a caller cannot choose it by sending the header.
**Behind a proxy, list it**:

```yaml
security:
    # A proxy on the same host:
    trusted_proxies: ["loopback"]
    # A proxy container on a Docker network (its address is assigned by Docker):
    # trusted_proxies: ["uniquelocal"]
```

Without the entry nothing fails outright, but three things go wrong quietly:

- Every request appears to come from the proxy. The login rate limit then counts all users
  together, and `security.allowed_networks` and a client's allowed address are checked
  against the proxy's address.
- A new inbound client is restricted to the proxy's address instead of the agent's.
- The session cookies lose `Secure`, because the server sees the proxy's plain-HTTP
  connection rather than the browser's HTTPS one.

The startup log says which proxies are trusted, or that none are.

The proxy has to pass WebSockets (`/ws/dashboard`, `/ws/agent`) and should send
`X-Forwarded-Proto`, so the session cookies are marked `Secure`. Traefik does both by default;
for nginx:

```nginx
location / {
    proxy_pass http://dim-server:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The server sends a Content-Security-Policy and the usual hardening headers. A proxy that
injects scripts into the dashboard will see them blocked. `Strict-Transport-Security` is off
unless `security.hsts: true` is set — enable it, or let the proxy send it, once the dashboard
is served over HTTPS only.

## Agent registration

- A registration token is valid for 30 minutes and for one registration.
- Every registration additionally needs the agent's **setup PIN** from its log, or its
  `DIM_REGISTRATION_SECRET` — someone who can reach port 3001 cannot take the host over. See
  [The setup PIN](guide/clients.md#the-setup-pin).
- The server issues the client id and a permanent auth token. The agent authenticates with
  both on every connection; tokens are compared in constant time.

## Address checks for agent connections

Three settings decide where an agent connection may come from. An empty list means no
restriction.

| Setting | Scope | Question it answers |
| :------ | :---- | :------------------ |
| `security.allowed_networks` (server `config.yaml`) | all agents | May *any* agent connect from this network? |
| Allowed IP or network (client editor, inbound clients) | one client | Does the connection come from where *this* client is allowed to be? |
| `allowedNetworks` (agent `config.yaml`) | one agent | May the server dial this agent from here? (outbound) |

A new inbound client starts out restricted to the address it registered from. Widen it to a
network, or switch the check off, for a host whose address changes (DHCP, a container on a
bridge network). The client editor warns when a new value would lock out the address the agent
last connected from — otherwise the mistake only shows at the next reconnect, as an offline
client.

The server checks the connection's peer — or, when that peer is listed in
`security.trusted_proxies`, the address the proxy forwarded. The agent checks the socket peer.
Behind a reverse proxy, list the proxy's address. With
Docker's userland proxy (Docker Desktop, ports published on `127.0.0.1`) the peer is the bridge
gateway — the agent logs `denied: not in allowedNetworks` with the address it actually saw. A
wrong `allowedNetworks` can only be fixed on the agent host.

## TLS

The link between server and agent can be encrypted in either direction.

**Inbound agent → server.** Give the agent an `https://` server URL; its `wss://` connection
follows. The agent verifies the server's certificate. For a self-signed one set
`allowSelfSignedCertificates: true` in the agent's `config.yaml`.

**Server → outbound agent.** The auth token travels in the `/ws/agent` query string, so over
plain `ws://` it is readable by anything on the path. Two settings, which have to agree:

1. The agent serves TLS — a `tls` block in its `config.yaml`, or a reverse proxy in front of it:

    ```yaml
    tls:
        cert: /etc/dim/agent.crt
        key: /etc/dim/agent.key
    ```

2. The client's **target address** says so: `wss://host:3001` instead of `host:3001`.

An agent whose `tls` block cannot be read does not start — it never falls back to plain HTTP.
The server verifies the agent's certificate; for self-signed agent certificates, common on a
home network, set this in the server's `config.yaml`:

```yaml
security:
    allow_self_signed_agent_certificates: true
```

## What is stored where

| Secret | Stored in |
| :----- | :-------- |
| User passwords (bcrypt), registration tokens (SHA-256), inbound clients' auth tokens (SHA-256) | the server's SQLite database (`server-data` volume) — hashes only, the server just has to recognise the value |
| Outbound clients' auth tokens | the server's SQLite database, encrypted (AES-256-GCM) with `secretKey` — the server presents them when it dials, so it has to read them back |
| Session signing key (`jwtSecret`), encryption key (`secretKey`), OIDC client secret | the server's `config.yaml` |
| The agent's client id and auth token | `identity.json` in the agent's `client-data` volume |

The database and `config.yaml` are kept apart on purpose — a volume and a bind-mounted file —
so a copy of the volume alone contains no usable agent token. Back them up separately.

## Container users

The server process runs as the unprivileged user `node` (UID 1000), not as root. The
container starts as root only for a moment: its entrypoint hands the data volume and, when
the server cannot write it, the mounted `server-config.yaml` to UID 1000, then drops to
that user. So an installation from an older image keeps working after an update, but
`server-config.yaml` on the host may afterwards belong to UID 1000. Check with
`docker top dim-server`, not `docker exec … id`: `exec` starts its shell as root.

To pick the UID yourself, set `user: "1234:1234"` on the service. The entrypoint then
changes nothing, and the volume and the config file have to be writable by that UID —
otherwise the server stops at start-up and names the directory it cannot write.

The agent stays root on purpose. It drives the host's Docker socket, and access to that
socket is root on the host whatever user the container runs as.

## What the agent container may do

The Docker socket makes the agent root on the host, and nothing in `compose.yaml` changes
that: whoever controls the agent can start a privileged container that mounts the host's file
system. The shipped `compose.yaml` still takes away everything the agent does not need, so
that a flaw in the agent has to go through the Docker API to get anywhere -- a write to the
image's own files, a raw socket or a setuid binary is no longer a way.

| Setting | What it takes away |
| :-- | :-- |
| `cap_drop: ALL` | Every capability; the agent needs none. Among them `NET_RAW`, `DAC_OVERRIDE` (files of other users), `CHOWN`, `SETUID` and `MKNOD`. |
| `security_opt: no-new-privileges:true` | Setuid binaries can no longer raise privileges. |
| `read_only: true`, `tmpfs: /tmp` | The agent writes `config.yaml` and its data volume, nothing else. |

**`client-config.yaml` has to belong to root** (`sudo chown root: client-config.yaml`).
Without `DAC_OVERRIDE` root in the container can write only files it owns; a file belonging
to the operator's user stays readable, but the server URL of a registration through the web
UI is not written back (`Failed to save config.yaml` in the agent's log). The identity itself
is not affected: it goes to `identity.json` in the data volume.

A self-update keeps these settings, because the replacement container is created with the
host configuration of the one it replaces. For the same reason an agent that was started
without them does not gain them by updating itself: add them to its `compose.yaml` and
recreate it with `docker compose up -d`.
