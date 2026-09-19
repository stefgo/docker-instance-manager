# Screenshot job

Regenerates every screenshot in `docs/assets/screenshots/`.

```bash
npm run screenshots              # rebuild the frontend, then capture
npm run screenshots -- --no-build
```

The first run needs Chromium:

```bash
npx playwright install chromium
```

`shared` has to be built (`npm run build -w shared`) before the frontend can be.

## What it does not need

No backend, no database, no agent and no Docker daemon. The dashboard's REST calls and its
`/ws/dashboard` socket are answered inside the browser by Playwright's interception, and
the built bundle is served by `serve.mjs`. That is what makes a run reproducible on a
fresh checkout and in CI -- and it is also why an "online" host can appear at all: online
means a live agent connection on the real server.

The socket is not optional the way it is for a purely REST-driven page. The server pushes
`CLIENTS_UPDATE`, `DOCKER_STATE_UPDATE`, `PROJECTS_UPDATE`, `ACTIVITY_UPDATE` and
`AUTO_UPDATE_LABEL_UPDATE` over it, so the mock sends all five as soon as the page opens it.

Authentication is skipped the same way. The SPA decides it is logged in from the
non-httpOnly `dim_auth` cookie the server sets beside the JWT, so the capture sets that
flag itself. It grants nothing: every request it would authorise is answered by the mock.

## Reproducibility

Two consecutive runs produce byte-identical PNGs. Three things arrange that, and breaking
any of them turns every commit into an image diff across the whole directory:

- **The clock** is frozen to `FIXED_NOW` in `fixtures.mjs`, so "Up 3 days" stays three days.
- **The timezone** is pinned to UTC and the locale to `en-US`, so the same commit renders
  the same on a laptop in Berlin and a runner in London.
- **The version** in the header is read from the root `package.json` and passed to the
  build as `VITE_APP_VERSION`. Left alone, `vite.config.js` appends the commit hash.

Digests and ids in `fixtures.mjs` are sha256 hashes of fixed strings for the same reason.
An image's id and digest are derived from its reference, so the same image on two hosts
carries the same values on both -- which is what lets the image and container lists fold
them into one row.

## Keeping the fixtures honest

`fixtures.mjs` follows `shared/src/schemas.ts` and `shared/src/types.ts`, but **nothing
checks that it still does** -- the objects are serialised straight to JSON, so neither
`tsc` nor Zod ever sees them. When an API response shape changes, this file has to be
corrected by hand.

An endpoint with no fixture logs `! unmocked GET /api/v1/…` during the run. **A clean run
prints no warnings.** A shape that changed without the path changing is the case that slips
through -- the page renders empty or wrong, which is why the output is worth looking at
rather than only counting.

The project counts (`containerCount`, `clientIds`, …) are written out rather than derived:
the server resolves them from the project query, and the screenshot job has no business
depending on the backend's resolver. Change a container's compose label and the project it
belongs to has to be adjusted by hand.

## Adding a shot

Add an entry to `DASHBOARD_SHOTS` or `AGENT_SHOTS` in `capture.mjs`, then embed the file
in a page under `docs/`.

Height is fitted per page, not fixed: `fitToContent` measures the bottom of `main`'s last
child and resizes the viewport to it, never below `MIN_HEIGHT` -- the height at which the
sidebar is still complete. It deliberately does not use `main.scrollHeight`: `main` is a
flex child filling the viewport, and a scroll container never reports less than its own
client height.

## In the documentation

`docs/index.md` embeds its six pairs as a `<figure>` holding two images, whose `src` ends
in Material's `#only-light` / `#only-dark` markers. Material hides the wrong one through
`[data-md-color-scheme=slate] img[src$="#only-light"]`, so the pair follows **the palette
toggle** -- not only the operating system setting, which is all a `<picture>` with a
`prefers-color-scheme` source could see.

Raw HTML is safe **only on that page.** Every other page is published a directory deep, so
its assets resolve as `../assets/…` there while GitHub still wants `assets/…`. Those pages
embed a single dark image with ordinary Markdown syntax, and shots used only there carry
`themes: ["dark"]` so no unused light variant is written.
