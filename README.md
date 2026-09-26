# Docker Instance Manager (DIM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/) ![Build Workflow](https://github.com/stefgo/docker-instance-manager/actions/workflows/build.yml/badge.svg)

**One dashboard for all your Docker hosts.** A lightweight agent runs next to the Docker Engine
on each host; a central server collects what the agents report and sends back what you ask
them to do. DIM replaces neither Docker nor Compose — it is the control plane above the
engines you already run.

![The DIM client list](docs/assets/screenshots/clients-dark.png)

## Features

- **Every host in one place** — containers, images, volumes and networks, live over WebSockets.
- **Container and image actions** — start, stop, restart, remove, pull, prune, straight from the UI.
- **Update checks** — local digests compared with Docker Hub, `ghcr.io` and `lscr.io`.
- **Pull & Recreate** — update an image and recreate its containers in one step.
- **Projects** — group containers across hosts by a query and update them together.
- **Autonomous auto-update** — label- or project-driven, scheduled per host or project, run by
  the agents themselves, so it keeps working while the server is down.
- **Activity list** — what happened on each host, from the Docker event stream, grouped by the
  action or run that caused it.
- **Secure by default** — agents register with a one-time token and a setup PIN; per-client
  address checks; local accounts and OIDC single sign-on.

## Quick start

**Server** — in an empty directory, `touch server-config.yaml` first, then:

```yaml
services:
    dim-server:
        image: ghcr.io/stefgo/dim-server:latest
        container_name: dim-server
        ports:
            - "3000:3000"
        volumes:
            - server-data:/app/server/backend/data
            - ./server-config.yaml:/app/server/config.yaml
        environment:
            - NODE_ENV=production
        restart: unless-stopped

volumes:
    server-data:
```

`docker compose up -d`, open `http://<server>:3000` and sign in with `admin` / `admin` —
then change that password under **Users**.

**Agent** — on each Docker host, `touch client-config.yaml`, then:

```yaml
services:
    dim-client:
        image: ghcr.io/stefgo/dim-client:latest
        container_name: dim-client
        ports:
            - "3001:3001"
        volumes:
            - /var/run/docker.sock:/var/run/docker.sock
            - ./client-config.yaml:/app/client/config.yaml
            - client-data:/app/client/data
        environment:
            - NODE_ENV=production
        restart: unless-stopped

volumes:
    client-data:
```

`docker compose up -d`, then in the dashboard **Clients → Add Client** → *The agent connects to
this server* → **Generate Token**. Open `http://<host>:3001/register` and enter the server URL,
the token and the setup PIN from `docker logs dim-client`.

The [Quick Start guide](https://stefgo.github.io/docker-instance-manager/quickstart/) walks
through the same steps with screenshots.

## Documentation

**[stefgo.github.io/docker-instance-manager](https://stefgo.github.io/docker-instance-manager/)**
— sources in [`docs/`](./docs):

- [Quick Start](https://stefgo.github.io/docker-instance-manager/quickstart/) and
  [Configuration](https://stefgo.github.io/docker-instance-manager/configuration/)
- User guide: [Clients](https://stefgo.github.io/docker-instance-manager/guide/clients/),
  [Updates & Auto-Update](https://stefgo.github.io/docker-instance-manager/guide/updates/),
  [Activity](https://stefgo.github.io/docker-instance-manager/guide/activity/)
- [Security](https://stefgo.github.io/docker-instance-manager/security/),
  [Operations](https://stefgo.github.io/docker-instance-manager/operations/),
  [Upgrade Notes](https://stefgo.github.io/docker-instance-manager/upgrade-notes/)
- [REST & WebSocket API](https://stefgo.github.io/docker-instance-manager/api/) and the
  architecture of [backend](https://stefgo.github.io/docker-instance-manager/backend/),
  [frontend](https://stefgo.github.io/docker-instance-manager/frontend/) and
  [agent](https://stefgo.github.io/docker-instance-manager/client/)

## Development

An npm monorepo: `server/backend` (Fastify, SQLite), `server/frontend` (React, Vite),
`client` (the agent, Dockerode) and `shared` (types and Zod schemas). Setup, build pipeline and
release process are in the
[Development guide](https://stefgo.github.io/docker-instance-manager/development/).

Contributions are welcome — for larger changes please open an issue first.

## License

MIT — see [LICENSE](LICENSE).
