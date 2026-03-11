# 🤖 Client Agent Architecture

This documentation details the architecture of the Node.js client agent (`client/`), which runs on the machines that are being managed by the Docker Instance Manager.

## 💻 Platform Support

The client agent supports multiple architectures:

- **x86_64 (amd64)**: Standard Docker image `dim-client`.
- **ARM64 (aarch64)**: Dedicated Docker image `dim-client-arm64`, optimized for devices like Raspberry Pi.

## 📂 Project Structure

The client is a lightweight, headless Node.js process designed to run as a daemon (either via systemd or Docker).

```
client/src/
├── core/          # Base services: SQLite DB, WebSocket Connection, Logger, Config
├── features/      # Business logic: Job Scheduling, Command Execution, WS Handlers
├── web/           # Internal Web Server: Status and Registration pages
└── index.ts       # Application entry point
```

## 🏗 Core Components

### 1. Core Connection (`src/core/Connection.ts`)

The `Connection` class manages the persistent WebSocket connection to the central server.

- **Features**: Automatic reconnection with exponential backoff, ping/pong health checks, and secure transmission of all payload data.
- **Registration Flow**: If the client is unauthenticated, the user must provide a temporary registration `token`. The client POSTs this to the server, exchanges it for a permanent client configuration, and saves it locally.

### 2. Job Executor & History Sync (`src/features/Executor.ts`)

The Executor acts as a wrapper around management CLI tools (e.g., Docker commands).

- It translates abstract JSON job configurations from the server into CLI arguments.
- It spawns a child process for the task run and captures real-time `stdout`/`stderr` streams.
- **History Synchronization**: Upon completion, the job result is stored in the local SQLite database. The client then attempts to synchronize this history with the central server to ensure a persistent, global record.

### 3. Local Web Server (`src/web/server.ts`)

The client includes a micro-server for local management and initial setup.

- **Status Page**: Provides a quick overview of the client's connectivity and scheduling state.
- **Registration**: Allows manual registration via the web interface if automatic provisioning is not used.

- Upon reaching the scheduled time, it triggers the `Executor` autonomously and attempts to upload the result to the server immediately (or buffers it if offline).

### 4. Cleanup (`src/features/Cleanup.ts`)

To prevent the local SQLite database from growing indefinitely, the client performs daily maintenance tasks.

- **Scheduling**: Uses `node-cron` to run a cleanup job every day at 00:00.
- **Pruning**: Deletes old `job_history` entries and orphaned `job_schedule_state` records based on the configured `retentionTime`.

### 5. Event Handlers (`src/features/Handlers.ts`)

Incoming WebSocket messages from the server (e.g., manual trigger requests from the dashboard) are routed to these handlers.

## 🗄 Database Management

The client uses a minimal **SQLite3** configuration to persist its identity, the jobs downloaded from the server, and local scheduling states. This ensures the client can function and evaluate scheduled tasks completely offline.
