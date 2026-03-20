# Development & Deployment Guide

This document describes the setup of the development environment as well as build management and deployment for the Docker Instance Manager.

## Development Environment

Development is performed inside Docker containers to ensure a consistent, platform-independent environment.

### Prerequisites

- Docker and Docker Compose (or Docker Desktop)
- A `.env` file in the root directory (excluded from git). Must contain at minimum:

```env
NPM_TOKEN=<your-token>
```

### Starting the Development Environment

The development environment is configured via `compose.dev.yaml`:

```bash
docker compose -f compose.dev.yaml up --build
```

This starts two services:

| Service      | Port   | Dockerfile                       | Description                                                                                     |
| :----------- | :----- | :------------------------------- | :---------------------------------------------------------------------------------------------- |
| `server-dev` | `3000` | `docker/Dockerfile.server.dev`   | Backend + frontend in watch mode (`npm run dev -w server/backend`). Hot-reloads on code changes. |
| `client-dev` | `3001` | `docker/Dockerfile.client.dev`   | Client agent in watch mode (`npm run dev -w client`). Depends on `server-dev`.                  |

**Volume mounts:**
- `server/`, `shared/` → mounted into `server-dev` for live code editing.
- `client/`, `shared/` → mounted into `client-dev`.
- `node_modules` is isolated as a Docker volume per service to prevent conflicts between host OS (macOS/Windows) and Linux container dependencies.
- If a local checkout of `@stefgo/react-ui-components` exists, it is mounted into both containers at `/app/react-ui-components` for local library development.

**Host filesystem access:**
- `client-dev` mounts the host root at `/mnt` to allow management operations during development.

---

## Build Management

Production images use multi-stage Docker builds:

| Component        | Dockerfile                  |
| :--------------- | :-------------------------- |
| Server           | `docker/Dockerfile.server`  |
| Client           | `docker/Dockerfile.client`  |

**Build stages:**
1. **`builder`**: Installs all dependencies, builds all TypeScript workspaces (`shared`, `client`, `server/frontend`, `server/backend`).
2. **`runner`**: Copies only compiled output and production dependencies (`npm ci --omit=dev`) into a slim base image (`node:22-bookworm-slim` or `debian:bookworm-slim`).

### Version Injection

The `scripts/generate-version.sh` script writes a `VERSION` file into the image during build. Version resolution priority:

1. `APP_VERSION` environment variable (CI/CD).
2. Exact git tag on current commit.
3. Fallback: `{branch}-{short-hash}[-dirty]`.

### Multi-Architecture Support

Both the server and client images are built for multiple platforms:

| Component | Supported Platforms                  |
| :-------- | :----------------------------------- |
| Server    | `linux/amd64`, `linux/arm64`         |
| Client    | `linux/amd64`, `linux/arm64`         |

---

## Deployment

### Configuration (`.env`)

The deployment script reads from the `.env` file in the root directory:

```env
REGISTRY=registry.example.com
TAG=latest
PLATFORMS_SERVER=linux/amd64,linux/arm64
PLATFORMS_CLIENT=linux/amd64,linux/arm64
NPM_TOKEN=<your-token>
```

### Building and Pushing Images

Use the deployment script to build multi-arch images and push them to the registry:

```bash
./scripts/deploy-registry.sh
```

The script uses `docker buildx build` with `--push` to build and push images in one step. It automatically creates a `buildx` builder instance (`dim-builder`) if one doesn't exist yet.

### Running in Production

After images are pushed, deploy on the target host using the production Compose file:

```bash
docker compose pull
docker compose up -d
```

**Production services (`compose.yaml`):**

| Service      | Port   | Volumes                                            | Description            |
| :----------- | :----- | :------------------------------------------------- | :--------------------- |
| `dim-server` | `3000` | `server-data` (SQLite DB), `./server-config.yaml`  | API + web dashboard.   |
| `dim-client` | `3001` | `client-data`, `./client-config.yaml`              | Client agent.          |

Both services use `restart: unless-stopped`.

---

## npm Scripts Reference

All scripts are defined in the root `package.json` and target individual workspaces via `-w`.

| Script           | Description                                                 |
| :--------------- | :---------------------------------------------------------- |
| `dev:server`     | Start backend in watch/dev mode.                            |
| `dev:frontend`   | Start frontend Vite dev server with HMR.                    |
| `start:server`   | Start backend in production mode.                           |
| `start:frontend` | Serve the built frontend.                                   |
| `start:client`   | Start client agent in production mode.                      |
| `build`          | Build `shared` first, then all other workspaces.            |
| `clean`          | Remove compiled output from `shared`, `client`, and `server`. |
