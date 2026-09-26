# Security

An agent controls its host's Docker socket, and the server controls every agent. This page
lists what protects that chain and what you have to set up yourself.

## Checklist

- The `admin` / `admin` password is changed ([Quick Start](quickstart.md#2-sign-in)).
- The server is reachable only through a reverse proxy with TLS ([below](#reverse-proxy)).
- Agents that the server dials outside a trusted network serve TLS ([below](#tls)).
- The agents' data volumes are readable only by root — they hold each agent's auth token.
- `enableRegisterPage: false` on agents that will not be registered again.

## Sign-in

- Local accounts (bcrypt) and [OIDC](configuration.md#oidc-single-sign-on), selectable per
  user.
- Sessions are an httpOnly cookie that expires after `jwtExpiresIn` (default 12 h).
- `POST /api/login` accepts at most **10 attempts per 15 minutes** per client IP.

## Reverse proxy

The server runs with `trustProxy` and takes the client IP from `X-Forwarded-For`. Behind
Traefik, nginx or Caddy that is correct, because the proxy sets the header. **Without a proxy a
caller can send the header with any value**, and the login rate limit and the per-client
address checks then rely on a value the caller controls. Expose port 3000 only through the
proxy.

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

The agent checks the socket peer. Behind a reverse proxy, list the proxy's address. With
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
| User passwords (bcrypt), client auth tokens, registration tokens | the server's SQLite database (`server-data` volume) |
| Session signing key (`jwtSecret`), OIDC client secret | the server's `config.yaml` |
| The agent's client id and auth token | `identity.json` in the agent's `client-data` volume |
