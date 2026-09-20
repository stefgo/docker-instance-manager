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
├── docs/                # Documentation, published to GitHub Pages (mkdocs.yml)
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
npm run lint             # ESLint over shared, client and server/backend
npm run lint:frontend    # ESLint over server/frontend (its own config)

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
- Two entry points: `@dim/shared` (types, schemas, constants — imported by the frontend)
  and `@dim/shared/node` (Node-only code, currently the pino logger). Anything that needs
  Node goes behind `/node`, or it lands in the browser bundle.

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
  Tailwind swaps the **preset** as well as its content glob: the preset carries the theme,
  so a local build on the installed preset would run new components on the old theme.

## Code Style

- **Indentation**: 4 spaces in all workspaces and config files, no tabs. No formatter is
  configured — match the surrounding file.
- **Linting**: two configs, one per kind of code, because a file must not be matched by
  both. `eslint.config.mjs` at the root covers `shared`, `client` and `server/backend`
  (js, mjs, ts; Node globals; typescript-eslint recommended, no type information) and
  ignores `server/frontend`; `server/frontend/eslint.config.js` covers the frontend's
  `src/**/*.{ts,tsx}` and adds react-hooks and react-refresh. A new Node workspace is
  covered by the root config without another file. Errors fail the run; no rule is
  downgraded to a warning. `prefer-const` runs with `ignoreReadBeforeAssign`, for the
  `let` a closure reads before anything assigns it.
  A context is split into a JSX-free `XContext.ts` (context object and hook) and an
  `XProvider.tsx`, so `react-refresh/only-export-components` stays an error.
  `react-hooks/set-state-in-effect` is an error too: a loader lives inside its effect and
  sets state only after an `await` (a reload bumps a counter the effect depends on), and
  state derived from props is reseeded while rendering, not in an effect.
- **Quotes**: double quotes for string literals in every workspace, double quotes for JSX
  attributes. Template literals where they earn it. There is no formatter, so this is a rule
  rather than a setting: what matters is that a file does not mix the two.
- **Language**: TypeScript throughout

## Commits

- **Conventional Commits**, checked locally by `.githooks/commit-msg` against
  `commitlint.config.mjs`. The root `prepare` script sets `core.hooksPath` on every
  `npm install`. `ci.yml` lints commits only on pull requests, and this repository is
  maintained without them, so the hook is the check that actually runs.
- **The commit type is the only input the version number comes from**: `feat` raises the
  minor, `fix`, `perf` and `revert` the patch, every other type releases nothing.
- **Commit messages are written in English** — subject and body. The existing history is
  German and stays as it is; the rule applies going forward.
- **No `!` in the header** (`feat!: …` is rejected by the `no-breaking-bang` rule): the
  Angular preset semantic-release reads commits with does not know it, so such a commit
  would release nothing. A breaking change is declared with a `BREAKING CHANGE:` footer,
  which raises the **minor** position, not the major one.
- **A body line that starts with one word and a colon** (`happened: …`) is parsed as the
  start of the footer. Rephrase it.
- `subject-case` is off, so an English subject in sentence case is fine
  (`fix: Validate the settings before saving them`).
- Release commits (`chore(release): x.y.z`) are exempt from commitlint; their body is the
  generated release notes.
- `.githooks/pre-push` allows pushing `main` and `dev` only; topic branches stay local.

## Versioning and Releases

`semantic-release` owns the version. It runs from `.github/workflows/release.yml`, which is
**`workflow_dispatch` only and refuses any branch but `main`**: a release is an action, not a
side effect of pushing. **Never bump a version or create a `v*` tag by hand.**

- Inputs: `dry_run` (default on) prints the next version and changes nothing; `bump`
  (`auto` | `major`) is the only way a major version is created. A run that was asked for
  and produces no release fails.
- The root `package.json` is the single source of truth for the version. It started at
  `0.0.5`, the last tag from before semantic-release; the workspace manifests keep `1.0.0`
  and nothing reads them.
- semantic-release pushes the tag over `GITHUB_TOKEN`, which starts no workflow, so
  `release.yml` dispatches `build.yml` on the tag ref itself and waits for it. That build is
  what moves `latest`.
- A push to `main` or `dev` publishes the rolling `:main` / `:dev` image plus `sha-<short>`
  — no tag, no version, no changelog entry.
- The version string is derived in one order everywhere: build argument, then the root
  `package.json` (with `+<hash>` when the commit carries no release tag), then git. The
  order lives in `scripts/generate-version.sh` and, mirrored, in
  `server/frontend/vite.config.js`. Only the client agent ships a `dist/VERSION` file.

## Testing

No test framework is configured. TypeScript and ESLint are the primary quality gates.
CI (`.github/workflows/ci.yml`) runs `npm run build`, `npm run typecheck -w server/frontend`,
`npm run lint -w server/frontend` and `npm run lint` on every branch and pull request;
`build.yml` calls the same workflow and only builds images once it passes. Run the four
locally before pushing.

## Docs

See `docs/` for detailed documentation:
- `docs/index.md` — Landing page of the published site; **not** a copy of the README, and
  the only page that exists solely for the site
- `docs/api.md` — REST and WebSocket API
- `docs/backend.md` — Backend architecture
- `docs/frontend.md` — Frontend structure
- `docs/client.md` — Client agent architecture
- `docs/development.md` — Development guidelines, the documentation site itself
- `docs/install.md` — Build and setup

### The docs are rendered twice

`docs/` is both the GitHub-browsable directory and the `docs_dir` of
[`mkdocs.yml`](mkdocs.yml) (MkDocs Material), published to
<https://stefgo.github.io/docker-instance-manager/> by
[`docs.yml`](.github/workflows/docs.yml) on pushes to `main`. **Every page has to
render in both**, which constrains three things:

- **A link out of `docs/` must be absolute**
  (`https://github.com/stefgo/docker-instance-manager/blob/main/…`). A relative
  `../compose.yaml` resolves on GitHub and nowhere else — MkDocs cannot follow a path
  outside its `docs_dir`, and `--strict` fails the build on it. Links between pages
  inside `docs/` stay relative.
- **`api.md` has a hand-written TOC with GitHub anchors** — the emoji is dropped and
  the leading space becomes a dash (`#-authentication`). `mkdocs.yml` sets
  `pymdownx.slugs.slugify(case=lower)` for exactly that reason. Changing the slugify
  function silently breaks those links.
- **A new page has to be added to `nav` in `mkdocs.yml`**; `--strict` fails on a page
  outside the navigation.

The workflow is deliberately **not** part of `ci.yml`/`build.yml`: that chain is the
gate on a release, and a documentation typo must not block one. The strict build runs on
every branch that touches the docs; only `main` deploys.
