# Upgrade Notes

What changed in behaviour or configuration between releases, and what to do about it when
upgrading. **Newest first.** The general procedure is in
[Operations](operations.md#upgrading); the release history is in
[CHANGELOG.md](https://github.com/stefgo/docker-instance-manager/blob/main/CHANGELOG.md).

## Auto-update schedules run on the agent's clock

Nothing changed in how a schedule runs: the agent has always read cron expressions in its own
time zone, which in the published image is **UTC**. What is new is that it says so. The agent
reports its zone on connect, and the client page and the host's cron field show it.

- **Check your schedules.** If you entered `0 3 * * *` meaning 03:00 local time, the update
  has been running at 03:00 UTC. Set `TZ` on the agent (see
  [Time zones](configuration.md#time-zones)) or adjust the expression.
- An agent of an older version reports no zone; the client page shows *Unknown* until it is
  updated.

## Outbound agents register with the setup PIN

`registrationSecret` in the agent's `config.yaml` is no longer read; an agent that still has it
logs a warning and ignores it. The **Add Client** wizard now asks for the agent's **setup PIN**
(`docker logs dim-client`) when the server connects to the agent. For an unattended rollout
set `DIM_REGISTRATION_SECRET` or `DIM_REGISTRATION_SECRET_FILE` on the agent and enter that
value instead. Agents that are already registered are not affected. An agent of an older
version still needs `registrationSecret`; the wizard says so when it meets one.

## The agent's identity moved out of config.yaml

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

## Auto-update runs in the agents — update the agents first

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

## The agent needs a persistent data directory

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

## The client editor warns before an allowed address locks the agent out

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

## Clients are added through one wizard

The dashboard's "Add Outbound Client" dialog and the two "Generate New Token" buttons are
replaced by a single **Add Client** wizard: step 1 picks which side opens the connection,
step 2 is the branch that follows from it. Tokens are issued there and nowhere else.

A registration token can now carry a display name and an allowed IP or network for the
client it will create (migration 08, both columns nullable). Without them the behaviour is
unchanged — the agent's hostname names the client, and the address it registers from becomes
its allowed address. `POST /api/v1/tokens` takes an optional body for those two fields; a
call without a body works as before, so **scripts keep working**. `POST /api/v1/register` is
unchanged, so **agents do not need updating.**

## The agent port is configurable, the target address editable

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

## Versions come from releases

Versions are now created by a release workflow instead of hand-made tags. The version the
dashboard shows and an agent reports has no leading `v` any more (`1.0.0`, not `v0.0.5`); an
image built from a branch shows `<branch>-<sha>`. Nothing compares the string, so server and
agents can still be updated independently.

**The `latest` and `0.0.3`–`0.0.5` images published before this change are broken in the
registry**: their platform images are gone, and `docker pull` fails on them. Until the first
release under the new model, pull `main`.

## The dashboard session is an httpOnly cookie

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

## Agents check the server's certificate

The agent used to switch off certificate checks for its whole process on the first request
its web UI sent to the server. Registration against a self-signed server therefore always
worked, while the WebSocket connection afterwards worked only if that had happened since the
agent started. Certificates are now checked for registration and for the connection alike.

**Agents that talk to a server with a self-signed certificate need
`allowSelfSignedCertificates: true`** in their `config.yaml`; without it they log that the
certificate could not be verified and stay disconnected. Servers behind a certificate from a
public or otherwise trusted CA are not affected. Agent only.

## trusted_networks is gone, the per-client address is editable

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

## Input validation on the REST API

Every endpoint now checks its body or query and answers `400` with the offending field
named. The dashboard is not affected. Scripts against the API may be:

- `POST /api/login` without `username` or `password` answers `400` instead of `401`.
- `PUT /api/v1/settings/cleanup` rejects a `security` block, and `GET` no longer returns one.
  Network and HSTS settings are configured in `config.yaml` only.
- Invalid settings values (a non-numeric retention, a malformed cron expression) are rejected
  instead of being stored or dropped silently.

Server only.

## config.yaml is checked on startup

The server validates `server/config.yaml` before it starts. A value of the wrong type or
format — `hsts: "yes"`, an invalid entry in `allowed_networks`, `oidc.enabled: true`
without `issuer`, an unknown `logLevel` — now stops the start with exit code 1 and a log
line naming the field, where it used to be accepted and misread later. Check the log after
upgrading; a valid file starts unchanged and is not rewritten. Server only.

## Session expiry

Every session token now carries an expiry (`jwtExpiresIn`, default `12h`). Tokens issued by
earlier versions had none; the server now refuses them once they are older than
`jwtExpiresIn`, and the dashboard discards them on load. **Every user has to log in once
after the upgrade.** Server only — agents are not affected.

## Setup PIN for agent registration

Registering an agent through its web UI (`http://<host>:3001/register`) now also asks for a
**setup PIN**. The agent prints it to its log when the web server starts
(`docker logs dim-client`) and after every successful registration. Scripts that call the
agent's `POST /api/register` directly have to send it as `pin`. `enableRegisterPage: false`
now disables that endpoint too, not only the page. Agent only — the server is not affected.

## Client ids are issued by the server

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

## An agent connects with its id and its token

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
