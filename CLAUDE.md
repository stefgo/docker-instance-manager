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
npm run lint                 # ESLint
npm run typecheck            # tsc against the installed UI library
npm run typecheck:local-ui   # tsc against a sibling checkout of the UI library
```

The Vite build does not type-check, so `typecheck` is the frontend's only type gate.

`build` names its workspaces one by one instead of using `--workspaces`, because
`shared` has to be built first and the others need its output. `--workspaces` would
build `shared` a second time, and its ordering would rest only on the position of
`shared` in the `workspaces` array. **A new workspace has to be added to that list by hand.**

There is no `start:frontend`: the frontend is a Vite SPA that builds into
`server/dist/public`, which the backend serves itself (see `server/backend/src/index.ts`).
`npm run start:server` therefore serves the frontend too. To look at a production
bundle without the backend, use `npm run preview -w server/frontend`.

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
- `VITE_USE_LOCAL_UI` / `VITE_UI_COMPONENTS_PATH` (shell environment of the frontend
  build, not read from `.env`): set `VITE_USE_LOCAL_UI=true` to build against a sibling
  checkout of `@stefgo/react-ui-components` instead of the installed package
  (default path `../react-ui-components`). **Off by default**, so a build never depends
  on a checkout that CI and containers do not have. Vite, Tailwind and
  `tsconfig.local-ui.json` (`npm run typecheck:local-ui`) all switch on it; use them
  together, or the compiler and the bundler see two versions of the same module.

## Code Style

- **Indentation**: 4 spaces in all workspaces and config files, no tabs. `package-lock.json`
  is the exception, npm writes it. No formatter is configured — match the surrounding file.
- **Linting**: ESLint for the frontend, covering `src/**/*.{ts,tsx}` via typescript-eslint
  (recommended, no type information) plus react-hooks and react-refresh. Errors fail
  the run; the only rules downgraded to warnings are `react-refresh/only-export-components`
  (contexts export provider and hook together) and `react-hooks/set-state-in-effect`
  (fetch-in-effect pattern) — known debt, not a license for new occurrences.
- **Language**: TypeScript throughout

## Commits

- **Conventional Commits**, checked locally by `.githooks/commit-msg` against
  `commitlint.config.mjs`. The root `prepare` script sets `core.hooksPath` on every
  `npm install`; CI does not lint commit messages.
- **Commit messages are written in English** — subject and body. The existing history is
  German and stays as it is; the rule applies going forward.
- **No `!` in the header** (`feat!: …` is rejected by the `no-breaking-bang` rule). A
  breaking change is declared with a `BREAKING CHANGE:` footer. Once releases are automated
  (release model, T4) that footer raises the minor position, not the major one; until then
  it is a convention without effect on a version number.
- `subject-case` is off, so an English subject in sentence case is fine
  (`fix: Validate the settings before saving them`).
- `.githooks/pre-push` allows pushing `main` only. `dev` joins it with the release model.

## Testing

No test framework is configured. TypeScript and ESLint are the primary quality gates.
CI (`.github/workflows/ci.yml`) runs `npm run build`, `npm run typecheck -w server/frontend`
and `npm run lint -w server/frontend` on every branch and pull request; `build.yml` calls
the same workflow and only builds images once it passes. Run the three locally before pushing.

## Docs

See `doc/` for detailed documentation:
- `doc/api.md` — REST and WebSocket API
- `doc/backend.md` — Backend architecture
- `doc/frontend.md` — Frontend structure
- `doc/client.md` — Client agent architecture
- `doc/development.md` — Development guidelines
- `doc/install.md` — Build and setup

**A link from `doc/` to a file outside it must be absolute**
(`https://github.com/stefgo/docker-instance-manager/blob/main/…`). A relative
`../compose.yaml` resolves on GitHub, but not once `doc/` is rendered as a site of its own
(MkDocs, T12): the site cannot follow a path out of its docs directory, and a strict build
fails on it. Links between pages inside `doc/` stay relative.
