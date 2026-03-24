# Docker Instance Manager — CLAUDE.md

## Project Overview

A monorepo for managing Docker containers across multiple hosts. Consists of:
- **server/backend** — Fastify API server (control plane)
- **server/frontend** — React SPA
- **client** — Lightweight Node.js agent daemon running on each Docker host
- **shared** — Common TypeScript types, Zod schemas, constants

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 22+, Fastify 5, SQLite (better-sqlite3), Pino |
| Frontend | React 19, Vite 7, Zustand, Tailwind CSS 3, React Router 7 |
| Client | Node.js, Fastify 5, Dockerode, ws |
| Shared | TypeScript, Zod 4 |
| Auth | JWT + optional OIDC |
| DB Migrations | Umzug |
| UI Components | @stefgo/react-ui-components |
| Icons | lucide-react |

## Monorepo Structure

```
docker-instance-manager/
├── shared/              # Types, Zod schemas, constants
├── client/              # Docker host agent
├── server/
│   ├── backend/         # Fastify REST + WebSocket API
│   └── frontend/        # React SPA (Vite)
├── doc/                 # Architecture and API docs
├── docker/              # Dockerfiles
├── scripts/             # Build/version scripts
└── compose.yaml         # Production Docker Compose
```

## Development Commands

```bash
# Root-level
npm run dev:server       # Backend in watch mode
npm run dev:frontend     # Frontend dev server (Vite)
npm run dev:client       # Client in watch mode
npm run build            # Build all workspaces
npm run clean            # Clean build artifacts

# Frontend only (server/frontend)
npm run lint             # ESLint
```

## Architecture Patterns

### Backend (server/backend)
- **Controller** → handles HTTP/WS routes
- **Service** → business logic (AuthService, DockerService)
- **Repository** → data access (UserRepository, ClientRepository, etc.)
- SQLite with WAL mode; schema managed via Umzug migrations in `migrations/`

### Frontend (server/frontend/src)
- Feature-based structure under `features/` (docker, clients, users, auth, tokens, app)
- Zustand stores in `stores/` (useClientStore, useDockerStore, useUIStore)
- React Contexts: ThemeContext, WebSocketContext, AuthContext
- Vite proxies `/api` and `/ws` to backend in dev

### Client (client)
- Persistent WebSocket connection to server
- Wraps Dockerode for local Docker management
- Optional built-in Fastify web server

### Shared (shared)
- Single source of truth for types and validation across all workspaces
- Always build shared first when making type changes: `npm run build -w shared`

## Configuration

- Server config: `server/config.yaml` (from `config.example.yaml`)
- Client config: `client/config.yaml` (from `config.example.yaml`)
- Build env: `.env` (registry, image tags, platforms, `VITE_USE_LOCAL_UI`)

## Code Style

- **Indentation**: 4 spaces for backend/client; 2 spaces for frontend and JSON
- **Formatting**: Prettier (`.prettierrc`)
- **Linting**: ESLint with React Hooks rules (frontend)
- **Language**: TypeScript throughout

## Testing

No test framework is configured. TypeScript and ESLint are the primary quality gates.

## Docs

See `doc/` for detailed documentation:
- `doc/api.md` — REST and WebSocket API
- `doc/backend.md` — Backend architecture
- `doc/frontend.md` — Frontend structure
- `doc/client.md` — Client agent architecture
- `doc/development.md` — Development guidelines
- `doc/install.md` — Build and setup
