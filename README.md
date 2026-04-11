# Docker Instance Manager (DIM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/) ![Build Workflow](https://github.com/stefgo/docker-instance-manager/actions/workflows/build.yml/badge.svg)

The **Docker Instance Manager** (DIM) is a centralized management system for controlling multiple Docker instances and related services across your infrastructure. It consists of a lightweight Node.js agent running on your clients and a central Fastify/React-based server providing a dashboard and API.

## 🚀 Features

- **Centralized Management:** View and control containers, images, volumes, and networks across all your Docker hosts from a single web dashboard.
- **Container Actions:** Start, stop, restart, pause, remove, and recreate containers directly from the UI.
- **Image Update Checks:** Compare local image digests against the upstream registry (Docker Hub, ghcr.io, lscr.io) to detect available updates — per tag or per digest.
- **Pull & Recreate:** Pull a newer image version and automatically recreate all affected containers in one step.
- **Real-time Updates:** Live state snapshots pushed from each agent via WebSockets — no polling required.
- **Notifications:** In-app notification view captures errors and warnings across the dashboard session.
- **Secure Communication:** Agents authenticate with a permanent token obtained via a short-lived registration token. Per-client IP validation with configurable allow/trust lists.
- **Authentication:** Local username/password and OIDC (OpenID Connect) for Single Sign-On, configurable per user.
- **Automated Maintenance:** Scheduled cleanup of used/expired registration tokens and stale image update cache entries.

## 🏗 Architecture

The project is structured as a monorepo containing four main components:

1. **Server Backend (`server/backend`):** A Fastify API server acting as the control plane. Manages client registrations, user authentication, Docker state persistence (SQLite), and image update checks against container registries.
2. **Server Frontend (`server/frontend`):** A React SPA built with Vite and Tailwind CSS. Displays containers, images, volumes, and networks aggregated across all clients in real time.
3. **Client Agent (`client`):** A lightweight Node.js daemon using Dockerode to communicate with the local Docker Engine. Streams state snapshots and executes actions dispatched by the server via a persistent WebSocket connection.
4. **Shared Library (`shared`):** Single source of truth for TypeScript types, Zod validation schemas, and WebSocket event constants used across all components.

## 📚 Documentation

Detailed documentation is available in the [`doc/`](./doc) directory:

- [Installation & Setup](doc/install.md) — Build, configure, and run the project locally or via Docker.
- [API Documentation](doc/api.md) — Full specification of the REST and WebSocket APIs.
- [Backend Architecture](doc/backend.md) — Services, repositories, database schema, and authentication flows.
- [Frontend Architecture](doc/frontend.md) — React feature structure, stores, and routing.
- [Client Agent](doc/client.md) — Agent architecture, Docker integration, and self-update mechanism.
- [Development & Deployment](doc/development.md) — Dev environment setup, build pipeline, and multi-arch deployment.

## 🐳 Quick Start (Docker Compose)

### Server

The easiest way to get the server running is using Docker Compose. A production-ready example `compose.yaml` could look like this:

```yaml
services:
    dim-server:
        container_name: dim-server
        # The image is multi-platform and supports both x86_64 and ARM64
        image: ghcr.io/stefgo/dim-server:latest
        ports:
            - "3000:3000"
        volumes:
            - ./server-data:/app/server/backend/data
            - ./server-config.yaml:/app/server/config.yaml
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

1. Copy `server/config.example.yaml` to `server-config.yaml` and configure your settings (like OIDC).
2. Run `docker compose up -d`
3. Access the dashboard at `http://localhost:3000` (Default credentials: `admin` / `admin`).

### Client

For the client agent, you also need to pass the configuration.

```yaml
services:
    dim-client:
        container_name: dim-client
        # Supports both x86_64 and ARM64 (e.g. Raspberry Pi)
        image: ghcr.io/stefgo/dim-client:latest
        volumes:
            - ./client-config.yaml:/app/client/config.yaml
            - /var/run/docker.sock:/var/run/docker.sock
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

1. Copy `client/config.example.yaml` to `client-config.yaml`.
2. Generate a registration token in the server dashboard and run the agent once — it will register itself and write the permanent `authToken` to the config file.
3. Run `docker compose up -d`.

## 🔧 Development

### Prerequisites

- Node.js v22+
- npm v10+

### Local Setup

1. Clone the repository: `git clone https://github.com/stefgo/docker-instance-manager`
2. Install dependencies: `npm install`
3. Build the shared library: `npm run build -w shared`
4. Start the server stack (Backend + Frontend): `npm run dev:server`
5. Start a test client: `npm run dev:client`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
