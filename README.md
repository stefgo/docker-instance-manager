# Docker Instance Manager (DIM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/) ![Build Workflow](https://github.com/stefgo/docker-instance-manager/actions/workflows/build.yml/badge.svg)

The **Docker Instance Manager** (DIM) is a centralized management system for controlling multiple Docker instances and related services across your infrastructure. It consists of a lightweight Node.js agent running on your clients and a central Fastify/React-based server providing a dashboard and API.

## 🚀 Features

- **Centralized Management:** View and manage all your Docker instances from a single web dashboard.
- **Job Scheduling & Execution:** Configure remote tasks, define schedules (cron-like), and trigger immediate actions.
- **Global History & Sync:** Centralized job execution history synchronized from all clients for a unified overview.
- **Real-time Monitoring:** View live log streams and status updates of ongoing runs via WebSockets.
- **File Browser:** Browse the remote file system of your clients directly from the web interface for management tasks.
- **Secure Communication:** Use secure WebSocket connections between clients and the server, authenticated via short-lived registration tokens.
- **Daily Maintenance:** Automated cleanup of old job histories and schedule states to keep the local database lean.
- **Authentication:** Supports local admin authentication and OIDC (OpenID Connect) for Single Sign-On.

## 🏗 Architecture

The project is structured as a monorepo containing four main components:

1.  **Server Backend (`server/backend`):** A Fastify API server acting as the control plane. It holds the SQLite database for configurations and job histories.
2.  **Server Frontend (`server/frontend`):** A modern React SPA (Single Page Application) built with Vite and Tailwind CSS.
3.  **Client Agent (`client`):** A lightweight Node.js daemon that wraps management CLI tools, listens for commands, executes scheduled jobs, and reports back via WebSockets.
4.  **Shared Library (`shared`):** Single source of truth for TypeScript types, Zod validation schemas, and constants used by all components.

## 📚 Documentation

Detailed documentation is available in the [`doc/`](./doc) directory:

- [Installation & Setup](doc/install.md) - Detailed guide on how to build and run the project locally.
- [API Documentation](doc/api.md) - Full specification of the REST and WebSocket APIs.
- [Frontend Architecture](doc/frontend.md) - Overview of the React application structure and state management.

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
        # Use dim-client:latest for x86_64 or dim-client-arm64:latest for ARM64 (e.g. Raspberry Pi)
        image: ghcr.io/stefgo/dim-client:latest
        volumes:
            - ./client-config.yaml:/app/client/config.yaml
            - ./client-data:/app/client/data
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

1. Copy `client/config.example.yaml` to `client-config.yaml`.
2. Provide the Server URL and a newly generated registration token (obtained from the web dashboard).
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
