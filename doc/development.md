# Development & Deployment Guide

This document describes the setup of the development environment as well as the build management and deployment for the Docker Instance Manager.

## Development Environment

Development is performed entirely within Docker containers to ensure a consistent environment.

### Prerequisites

- Docker and Docker Compose (or Docker Desktop)
- Environment variables file. You **must** create a `.env` file manually in the root directory (this file is excluded from git).

### Starting the Development Environment

The development environment is configured and started using the `compose.dev.yml` file:

```bash
docker compose -f compose.dev.yml up --build
```

This starts two services:

1. **server-dev**: The backend server with the UI. Based on `docker/Dockerfile.server.dev`.
    - Starts in watch mode (`npm run dev -w server/backend`).
    - Port `3000` is exposed externally.
    - Local source code (`server`, `shared`) is mounted into the container. Code changes take effect immediately.
2. **client-dev**: The client. Based on `docker/Dockerfile.client.dev`.
    - Port `3001` is exposed externally.
    - Local source code (`client`, `shared`) is mounted.
    - Has access to the host file system (`/:/mnt`) for management purposes in development mode.

The `node_modules` folders are isolated as volumes within the container. This prevents conflicts between the host system (e.g., macOS or Windows) and the container (Linux) regarding platform-specific dependencies.

## Build Management

The production container images are based on multi-stage builds in the following files:

- `docker/Dockerfile.server`
- `docker/Dockerfile.client`

These files ensure that all TypeScript modules (`shared`, `client`, `server/frontend`, `server/backend`) are built inside a `builder` stage first. The compiled files and production-only dependencies (`npm ci --omit=dev`) are then copied into the final, lightweight `runner` image (based on `debian:bookworm-slim` or `node:22-bookworm-slim`).

### Architectures (Multi-Arch)

- **Server**: Supports both `linux/amd64` and `linux/arm64`. This is enabled because the server relies solely on Node.js.
- **Client**: Supports both `linux/amd64` and `linux/arm64`.

## Deployment

The project uses a Bash script (`scripts/deploy-registry.sh`) to distribute images to an internal registry.

The script uses `docker buildx build` to compile the images directly for the targeted architectures and push them.

### Configuration (`.env`)

The deployment script evaluates variables from the `.env` file in the root directory:

```env
REGISTRY=registry.internal.g4l-online.de
TAG=latest
PLATFORMS_SERVER=linux/amd64,linux/arm64
PLATFORMS_CLIENT=linux/amd64
```

### Running the Deployment

To rebuild the images and push them to the registry, run the script from the root directory:

```bash
./scripts/deploy-registry.sh
```

The script automatically creates a new `buildx` builder instance (`dim-builder`) if needed, then sequentially executes the builds and pushes the images.

### Usage in Production

After a successful push, the updated images can be run on the target host using the production `compose.yaml`:

```bash
docker compose pull
docker compose up -d
```
