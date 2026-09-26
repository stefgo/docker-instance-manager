# Operations

Running DIM once it is installed: which image to pull, how to upgrade, what to back up, and how
to tell that it is healthy.

## Images and tags

Server and agent are published as multi-arch images (`linux/amd64`, `linux/arm64`):
`ghcr.io/stefgo/dim-server` and `ghcr.io/stefgo/dim-client`.

| Tag | What it is |
| :-- | :--------- |
| `latest` | The last release. **Use this one** unless you have a reason not to. |
| `1.2.0` | One release. Pin it to make an upgrade a decision rather than a side effect of `docker compose pull`. |
| `1.2` | The newest patch release of that minor version. |
| `main` | The current `main` branch — not a release, can be ahead of `latest`. |
| `dev` | Development state. Expect it to break. |
| `sha-<short>` | The build of one commit on `main` or `dev`. |

An image is tagged only after CI has started it and it passed its health check. The version
the dashboard shows in its header, and each agent's version in the client list, come from the
same build.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

- **Read the [upgrade notes](upgrade-notes.md) first.** They say when the order matters —
  some releases need the agents first, some the server.
- Agents can also be upgraded from the dashboard: **Pull & Recreate** on their `dim-client`
  container, or let auto-update do it by giving it the label.
- The database schema is migrated automatically when the server starts.
- After a server upgrade every open dashboard reloads itself when it next needs a file the new
  version no longer has.

## Backup

| What | Where | Why |
| :--- | :---- | :-- |
| Server database | `server-data` volume (`/app/server/backend/data`) | Users, clients, projects, tokens, activity |
| Server config | `server-config.yaml` | Session key, OIDC, settings |
| Agent state | `client-data` volume on each host | Its identity — lose it and the agent has to be registered again |

The database is SQLite in WAL mode, so copy it with the server stopped:

```bash
docker compose stop dim-server
docker run --rm -v dim-server_server-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/dim-server-data.tgz -C /data .
docker compose start dim-server
```

(The volume name is prefixed with the compose project, usually the directory name —
`docker volume ls` shows it.)

Docker state itself is not backed up by DIM: it is re-read from each host on every connect.

## Health

Both images declare a `HEALTHCHECK`, so `docker ps` shows `(healthy)`:

```bash
curl -fsS http://localhost:3000/api/health     # server: process and database
docker inspect --format '{{.State.Health.Status}}' dim-client
```

- **The agent's check does not cover its server connection.** An agent that cannot reach the
  server is still running and watching Docker. Whether it is connected shows as the dot in the
  client list, and on the agent's `/status` page.
- The agent's health route answers only inside its container (loopback); a `curl` from another
  machine gets `404` — that is intended.
- The checks follow the port the process actually listens on, including one moved through
  `config.yaml`.
- **Docker does not restart an unhealthy container.** `restart: unless-stopped` reacts to the
  process exiting. The health state is for monitoring and for
  `depends_on: condition: service_healthy`.

## Logs

```bash
docker logs -f dim-server
docker logs -f dim-client
```

`LOG_LEVEL=debug` (or `logLevel` in either `config.yaml`) makes both talkative;
`LOG_FORMAT=json` for a log collector. See [Configuration](configuration.md#environment-variables).

## Changing the port

`DIM_SERVER_PORT` / `port` and `DIM_CLIENT_PORT` / `listenPort` move the listen ports. Move the
compose port mapping with them, and on the other side:

- a moved **server** port changes every agent's server URL — edit `serverUrl` in each agent's
  `config.yaml`;
- a moved **outbound agent** port changes its target address — edit it in the client editor.
