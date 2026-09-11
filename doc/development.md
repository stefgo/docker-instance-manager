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
- If a local checkout of `@stefgo/react-ui-components` exists, it is mounted into both containers at `/app/react-ui-components` for local library development. `server-dev` sets `VITE_USE_LOCAL_UI=true` to use it.

**UI library outside the dev containers:** a plain `npm run build` or `npm run dev:frontend` uses the installed library version. Building against a sibling checkout is opt-in with `VITE_USE_LOCAL_UI=true`, type-checked with `npm run typecheck:local-ui -w server/frontend`. See [frontend.md](frontend.md#working-against-a-local-checkout-of-the-ui-library).

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

### Continuous Integration

There are no automated tests, so type checking and linting are the quality gates. Two GitHub Actions workflows enforce them:

| Workflow | Trigger | What it does |
| :------- | :------ | :----------- |
| `.github/workflows/ci.yml` | Push to any branch except `main`, every pull request, and `workflow_call` | Job `verify`: `npm ci`, `npm run build` (type-checks `shared`, `client` and `server/backend`, builds the frontend), `npm run typecheck -w server/frontend` (the Vite build does not type-check), `npm run lint -w server/frontend`. |
| `.github/workflows/build.yml` | Push to `main`, `v*.*.*` tags, manual | Calls `ci.yml` as job `verify`; `build-and-push` depends on it, so no image is published unless the checks pass. Job `smoke` then starts both published images and waits for `GET /api/health`. |

`npm ci` authenticates against GitHub Packages for `@stefgo/react-ui-components` with the workflow's `GITHUB_TOKEN` (`packages: read`). That works because the package is public; if it ever becomes private, the step needs a personal access token with `read:packages` instead.

**Smoke test.** The last job of `build.yml` is the only place where the images are executed: everything before it proves that the code compiles, not that the result starts. It pulls both images by their `sha-<short>` tag — the one reference that always exists and always means exactly this build — runs them (the agent with the runner's Docker socket, since it refuses to start without the Docker API), and waits up to 60 s each for `{"status":"ok"}` from `/api/health`. On failure it prints the container logs. It covers `linux/amd64` only; `arm64` would run emulated on this runner and waits for native ARM runners.

To reproduce the gate locally, run the same three commands without `VITE_USE_LOCAL_UI` set:

```bash
npm run build
npm run typecheck -w server/frontend
npm run lint -w server/frontend
```

### Registry Cleanup

[`cleanup-packages.yml`](https://github.com/stefgo/docker-instance-manager/blob/main/.github/workflows/cleanup-packages.yml) prunes GHCR every night at 02:00. It uses `dataaxiom/ghcr-cleanup-action` rather than the more obvious `actions/delete-package-versions`, and the reason is worth keeping: a multi-arch build pushes its per-architecture images and its attestations **untagged** — only the manifest list carries the tag.

```
dim-server:main  ─┬─► sha256:6612…  linux/amd64      ┐
                  ├─► sha256:3695…  linux/arm64      │ each one an untagged
                  ├─► sha256:c2c3…  attestation      │ version of the package
                  └─► sha256:77e4…  attestation      ┘
```

An action that deletes "untagged versions" therefore hollows out the tagged images from underneath. That is not hypothetical: it is how `dim-server:latest`, `dim-client:latest` and the `0.0.3`–`0.0.5` release tags came to be tags whose children all return 404 — `docker pull` fails on them. The previous `ignore-versions` regex could not prevent it, because it is matched against the version name, which for a container package is the digest.

The cleanup in use knows which children belong to a kept tag, and `delete-partial-images` removes the manifests that already lost theirs. `latest`, `main`, `dev` and anything shaped like a version are excluded from every rule — a deleted `1.2.0` breaks whoever pinned it, so release images accumulate. The exclusion also keeps the already broken tags above in place; `latest` becomes pullable again with the next release.

`validate: true` re-checks the result, but only as a warning. A step of the workflow's own therefore resolves every child digest of `latest`, `main` and `dev` individually and **fails** on a missing one — a hollowed-out image still lists its platforms in the index, only fetching the child shows that it is gone. A failing scheduled run is what GitHub sends a notification about. Until the next release replaces the broken `latest`, that step is expected to fail.

A manual run defaults to a dry run:

```bash
gh workflow run cleanup-packages.yml               # logs only
gh workflow run cleanup-packages.yml -f dry_run=false
```

The images are listed by name in the workflow; a new image has to be added there by hand.

### Commit Messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are written in English. The check runs locally in `.githooks/commit-msg` against `commitlint.config.mjs` — there is no commit-message step in CI. `npm install` activates the hooks through the root `prepare` script:

```bash
git config core.hooksPath .githooks   # runs automatically via `npm install`
```

- A breaking change is declared with a `BREAKING CHANGE:` footer. The `feat!:` spelling is rejected: the Angular preset that release tooling reads commits with does not recognise the `!`, and once releases are automated a breaking change raises the minor position, which a `!` would misrepresent.
- `.githooks/pre-push` allows pushing `main` only; topic branches stay local.
- `core.hooksPath` makes git ignore `.git/hooks`. A hook of your own belongs in `.githooks`.

### Indentation and `git blame`

Four spaces everywhere, no formatter — match the surrounding file. The switch of the frontend and the JSON files from two to four spaces is a single commit listed in `.git-blame-ignore-revs`. GitHub skips it in its blame view by itself; locally, tell git once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

A later commit that only reformats belongs in that file too, with its full hash.

---

## Deployment

### Running in Production

Deploy on the target host using the production Compose file:

```bash
docker compose pull
docker compose up -d
```

**Production services (`compose.yaml`):**

| Service      | Port   | Volumes                                            | Description            |
| :----------- | :----- | :------------------------------------------------- | :--------------------- |
| `dim-server` | `3000` | `server-data` (SQLite DB), `./server-config.yaml`  | API + web dashboard.   |
| `dim-client` | `3001` | `client-data`, `./client-config.yaml`              | Client agent.          |

Both services use `restart: unless-stopped` and declare a `healthcheck` against `GET /api/health` (see [install.md](install.md#health)). Docker does not restart an unhealthy container; the state is for monitoring.

---

## npm Scripts Reference

All scripts are defined in the root `package.json` and target individual workspaces via `-w`.

| Script           | Description                                                 |
| :--------------- | :---------------------------------------------------------- |
| `dev:server`     | Start backend in watch/dev mode.                            |
| `dev:frontend`   | Start frontend Vite dev server with HMR.                    |
| `dev:client`     | Start client agent in watch/dev mode.                       |
| `start:server`   | Start backend in production mode.                           |
| `start:client`   | Start client agent in production mode.                      |
| `build`          | Build `shared` first, then `client`, `server/backend` and `server/frontend`. |
| `clean`          | Remove compiled output from `shared`, `client`, and `server`. |

There is no `start:frontend`. The frontend builds into `server/dist/public` and is served by the backend, so `start:server` covers it. To serve a production bundle on its own, use `npm run preview -w server/frontend`.

`build` lists its workspaces explicitly rather than using `--workspaces`, which would build `shared` twice and rely on the order of the `workspaces` array. A new workspace has to be added to that list.
