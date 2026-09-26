# Configuration

DIM is configured in three places:

| Where | What goes there |
| :---- | :-------------- |
| **Dashboard → Settings** | Everything you change in day-to-day operation: auto-update defaults, the registry check, retention. Stored in the `settings` block of the server's `config.yaml`. |
| **Server `config.yaml`** | Sign-in (OIDC, sessions), port, network restrictions — what needs a restart. |
| **Agent `config.yaml`** | Per host: server URL, Docker socket, port, TLS, which local pages are served. |

Environment variables override a few keys of both files.

Both files are **checked on every start**. A value of the wrong type or format stops the
process with a log line naming the field, for example:

```
Invalid config.yaml -- security.hsts: Invalid input: expected boolean, received string
```

Unknown keys are kept and cause no error. An empty file is valid for both: every key has a
default, and the server writes its generated `jwtSecret` and the default settings into it.

## Server `config.yaml`

Mounted at `/app/server/config.yaml`. A commented template is
[`server/config.example.yaml`](https://github.com/stefgo/docker-instance-manager/blob/main/server/config.example.yaml).

| Key | Default | Description |
| :-- | :------ | :---------- |
| `logLevel` | `info` | pino level (`trace` … `fatal`, `silent`). `LOG_LEVEL` wins. |
| `port` | `3000` | Listen port. `DIM_SERVER_PORT` wins. The compose port mapping and every agent's server URL have to follow it. |
| `jwtSecret` | generated | Signs the session tokens. Generated and written back on first start. Changing it signs everybody out. |
| `jwtExpiresIn` | `"12h"` | Session lifetime (`"30m"`, `"24h"`, `"7d"`). Sessions always expire. |
| `oidc.*` | off | Single sign-on — see [OIDC](#oidc-single-sign-on) below. |
| `security.allowed_networks` | `[]` | IPv4 addresses or CIDR networks agents may connect from, for all agents. Empty allows every address. See [Address checks](security.md#address-checks-for-agent-connections). |
| `security.hsts` | `false` | Send `Strict-Transport-Security`. Only when the dashboard is reached exclusively over HTTPS. |
| `security.allow_self_signed_agent_certificates` | `false` | Accept an unverifiable certificate when the server dials an outbound agent over `wss://`. See [TLS](security.md#tls). |
| `settings.*` | see below | The values of the Settings page. |

### Settings

Everything under `settings` is edited on the **Settings** page and saved there, one tab at a
time; the table is for reference and for provisioning a server from a file. Values are strings.

| Key | Default | Settings tab — meaning |
| :-- | :------ | :--------------------- |
| `container_auto_update_cron` | `""` | *Container Auto-Update* — the default schedule every host and project inherits. Empty: only hosts and projects with a schedule of their own take part. |
| `container_auto_update_label` | `dim.auto-update=true` | The Docker label that enrols a container (`key=value`, or `key` for any value). The same key set to `false` opts a container out. |
| `container_auto_update_delay_label` | `dim.auto-update-delay` | Label holding a minimum image age in days before an update is applied. Empty disables delays. |
| `image_update_check_interval_seconds` | `"0"` | *Image Update Check* — how often every image of every host is compared with its registry. `0` disables the schedule; the Check buttons still work. |
| `image_version_cache_ttl_days` | `"30"` | *Image Version Cache* — age after which a cached check result is removed (`0`: never). |
| `image_version_cache_cleanup_orphans` | `"true"` | Also remove results for images no host runs any more. |
| `image_version_cache_cleanup_interval_hours` | `"24"` | How often that cleanup runs (`0`: never). |
| `token_retention_days` | `"30"` | *Client Tokens* — days a used or expired registration token is kept. |
| `token_cleanup_interval_hours` | `"24"` | How often the token cleanup runs (`0`: never). |
| `notification_retention_days` | `"90"` | *Activity History* — days an activity entry is kept. |
| `notification_retention_count` | `"500"` | Newest entries always kept, whatever their age. |
| `notification_cleanup_interval_hours` | `"24"` | How often the activity cleanup runs (`0`: never). |

### OIDC single sign-on

```yaml
oidc:
    enabled: true
    issuer: https://auth.example.com/application/o/dim/
    client_id: dim
    client_secret: "…"
    redirect_uri: https://dim.example.com/api/auth/callback
```

- Register DIM at your provider as a confidential client with the redirect URI
  `https://<dashboard>/api/auth/callback`. DIM asks for the scopes `openid profile groups email`.
- **Users are not created on first sign-in.** The provider's `preferred_username` (else
  `email`, else `sub`) has to match a user that exists in DIM and has *OIDC* ticked as a sign-in
  method (**Users** → edit).
- Restart the server after changing the block. The sign-in page then offers the provider.

## Agent `config.yaml`

Mounted at `/app/client/config.yaml`. A commented template is
[`client/config.example.yaml`](https://github.com/stefgo/docker-instance-manager/blob/main/client/config.example.yaml).
It holds only what you set — the identity the server issues at registration lives in the data
directory, not here.

| Key | Default | Description |
| :-- | :------ | :---------- |
| `serverUrl` | — | URL of the server, e.g. `https://dim.example.com`. Fills in the register page; a registration through that page writes it back. **Leave it empty for an outbound agent.** |
| `logLevel` | `info` | `debug`, `info`, `warn`, `error`. `LOG_LEVEL` wins. |
| `dockerSocket` | auto-detected | Path to the Docker socket. |
| `listenPort` | `3001` | Port of the agent's web server — its local pages and, in outbound mode, what the server dials. `DIM_CLIENT_PORT` wins. |
| `tls.cert` / `tls.key` | — | Serve the web server over HTTPS. Needed for `wss://` in outbound mode; see [TLS](security.md#tls). |
| `allowSelfSignedCertificates` | `false` | Accept a server certificate that does not validate. Needed for a server with a self-signed certificate. |
| `allowedNetworks` | `[]` | Addresses the **server** may dial this agent from (outbound mode). Empty allows every address. |
| `enableStatusPage` | `true` | Serve the status page at `/status`. |
| `enableRegisterPage` | `true` | Serve `/register`. It closes by itself once the agent is registered. |

Auto-update is deliberately not configurable here: the server sends every agent its policy,
so the dashboard always shows what the fleet actually does.

## Time zones

Two clocks are involved, and each has its own job:

- **The browser** shows every time in its own zone and reads times typed into it in that
  zone. The server stores and sends points in time as UTC, so nothing is lost on the way.
- **The agent** reads the cron expressions of its auto-update policy in *its* zone. The
  expression is sent as written, so `0 3 * * *` means 03:00 on the agent's clock.

The agent's zone is the `TZ` of its process. The published image sets none, so it is **UTC**
unless you give it one:

```yaml
    client:
        environment:
            - TZ=Europe/Berlin
```

Node ships its own time zone data, so `TZ` takes effect without `tzdata` in the image. The
agent reports its zone on every connect; the client page shows it, and so does the hint next
to the host's cron expression.

## Environment variables

| Variable | Applies to | Description |
| :------- | :--------- | :---------- |
| `LOG_LEVEL` | both | Overrides `logLevel`. |
| `LOG_FORMAT` | both | `pretty` or `json`. Defaults to `json` when `NODE_ENV=production`, else `pretty`. |
| `NODE_ENV` | both | `production` in the published images' compose files; picks the log format. |
| `TZ` | agent | Time zone the agent reads auto-update cron expressions in (default UTC). See [Time zones](#time-zones). |
| `DIM_SERVER_PORT` | server | Overrides `port`. An unusable value ends the start. |
| `DIM_CLIENT_PORT` | agent | Overrides `listenPort` — handy with `network_mode: host`, where a compose port mapping does not apply. |
| `DIM_CLIENT_DATA_DIR` | agent | Where the agent keeps its state (default `/app/client/data`). Only needed outside the shipped image. |
| `DIM_REGISTRATION_SECRET` | agent | A secret the **Add Client** wizard accepts instead of the setup PIN, for unattended rollouts. Remove it once the agent is registered. |
| `DIM_REGISTRATION_SECRET_FILE` | agent | The same, read from a file such as a Docker secret. Setting both, or a file that is empty or unreadable, ends the start. |
