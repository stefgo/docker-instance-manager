#!/usr/bin/env node
/**
 * Takes every screenshot that appears in docs/.
 *
 *     npm run screenshots              # rebuild the frontend, then capture
 *     npm run screenshots -- --no-build
 *
 * No backend, no database, no agent and no Docker daemon are involved. The dashboard's
 * data comes from Playwright's request and WebSocket interception (see fixtures.mjs), and
 * the built bundle is served by the small static server next door, so a run is
 * reproducible on any checkout and in CI.
 *
 * Three things keep the output stable between runs, which is what stops this from
 * producing a fresh diff for every image each time it is invoked:
 *
 *   - the clock is frozen to fixtures.FIXED_NOW, so "Up 3 days" stays three days,
 *   - the timezone is pinned to UTC, so the same run does not render differently on a
 *     laptop in Berlin and a runner in London,
 *   - the version in the header is pinned to the root package.json (see PINNED_VERSION),
 *     which otherwise carries the commit hash and a `-dirty` marker from git.
 */

/*
 * The callbacks handed to page.addInitScript and page.evaluate below are serialised
 * and run in the browser, not in this process -- `document` is defined there.
 */
/* global document */
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { serve } from "./serve.mjs";
import * as fixtures from "./fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");

const SPA_ROOT = path.join(REPO, "server/dist/public");
const AGENT_ROOT = path.join(REPO, "client/src/web/public");
const OUT = path.join(REPO, "docs/assets/screenshots");

const SPA_PORT = 4173;
const AGENT_PORT = 4174;

/**
 * 1440 wide at 2x. It is the narrowest desktop width that still shows the sidebar
 * expanded -- below it the Dashboard collapses to the mobile navigation, which is not
 * what a documentation page is trying to show. The height is only where a page starts;
 * `fitToContent` below replaces it per shot.
 */
const WIDTH = 1440;
const START_HEIGHT = 900;
const SCALE = 2;

/**
 * Bounds for the fitted height: enough to look like an application, not a scroll of one.
 * The floor is the sidebar, not the content: below 560px its last entry (Settings) is cut
 * off on a page as short as the client list.
 */
const MIN_HEIGHT = 560;
const MAX_HEIGHT = 1700;

/** Breathing room below the last card, in place of `main`'s own generous bottom padding. */
const CONTENT_MARGIN = 24;

/**
 * The agent's pages are a single narrow card centred in the viewport, so they are captured
 * on a canvas of their own. At dashboard width the card would be a stamp in the middle of
 * a very large dark rectangle.
 */
const AGENT_WIDTH = 640;
const AGENT_MARGIN = 48;

/**
 * The version shown in the header. Read from the root package.json -- the single source
 * of truth semantic-release maintains -- rather than derived from git, because
 * vite.config.js otherwise appends the commit hash. That would put a value in the
 * documentation that says more about the machine that ran this than about the release.
 */
const PINNED_VERSION = JSON.parse(
    fs.readFileSync(path.join(REPO, "package.json"), "utf8"),
).version;

const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
});

/**
 * Answers the dashboard's REST calls from the fixtures.
 *
 * Anything not listed gets an empty 200 rather than falling through to the network: an
 * unmocked endpoint would otherwise hit the static server, come back as index.html, and
 * fail to parse somewhere deep in a store -- a confusing way to learn that a route is
 * missing. The warning is the point, and a run that prints one needs a fixture added.
 */
async function mockDashboardApi(page) {
    await page.route("**/api/**", async (route) => {
        const p = new URL(route.request().url()).pathname;

        const clientDocker = p.match(/^\/api\/v1\/clients\/([^/]+)\/docker$/);

        if (p === "/api/auth/config") return route.fulfill(json(fixtures.authConfig));
        if (p === "/api/v1/me") return route.fulfill(json(fixtures.me));
        if (p === "/api/v1/clients") return route.fulfill(json(fixtures.clients));
        if (p === "/api/v1/projects") return route.fulfill(json(fixtures.projects));
        if (p === "/api/v1/activity") return route.fulfill(json(fixtures.activity));
        if (p === "/api/v1/users") return route.fulfill(json(fixtures.users));
        if (p === "/api/v1/tokens") return route.fulfill(json(fixtures.tokens));
        if (p === "/api/v1/settings/container-auto-update/label") {
            return route.fulfill(json({ labelFilter: fixtures.AUTO_UPDATE_LABEL }));
        }
        if (p === "/api/v1/settings/scheduler-status") {
            return route.fulfill(json(fixtures.schedulerStatus));
        }
        if (clientDocker) {
            const state = fixtures.dockerStates[clientDocker[1]];
            return route.fulfill(state ? json(state) : { status: 404, body: "" });
        }

        console.warn(`  ! unmocked ${route.request().method()} ${p}`);
        return route.fulfill(json({}));
    });

    // Unlike the REST calls, the dashboard socket is not optional here: it is how the server
    // pushes the Docker state of every host and which of them are online. It is answered by
    // a mock that never reaches a server and says everything a real one says on connect.
    await page.routeWebSocket("**/ws/dashboard", (ws) => {
        const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));
        send("CLIENTS_UPDATE", fixtures.clients);
        for (const [clientId, state] of Object.entries(fixtures.dockerStates)) {
            send("DOCKER_STATE_UPDATE", { clientId, state });
        }
        send("PROJECTS_UPDATE", fixtures.projects);
        send("ACTIVITY_UPDATE", fixtures.activity);
        send("AUTO_UPDATE_LABEL_UPDATE", { labelFilter: fixtures.AUTO_UPDATE_LABEL });
    });
}

async function mockAgentApi(page, state) {
    const answers = fixtures.agent[state];
    await page.route("**/api/**", async (route) => {
        const p = new URL(route.request().url()).pathname;
        if (answers[p]) return route.fulfill(json(answers[p]));
        console.warn(`  ! unmocked agent ${p}`);
        return route.fulfill(json({}));
    });
}

/**
 * The SPA decides it is logged in by looking for the non-httpOnly `dim_auth` companion
 * cookie the server sets next to the JWT (services/SessionCookie.ts, lib/apiFetch.ts).
 * Setting it here is what lets the capture skip the login round trip entirely -- the flag
 * carries no authority of its own, and every request it would authorise is answered by the
 * mock above.
 */
async function newPage(context, { theme, authenticated }) {
    const page = await context.newPage();
    await page.clock.setFixedTime(fixtures.FIXED_NOW);
    await page.addInitScript(
        ([theme, authenticated]) => {
            try {
                localStorage.setItem("theme", theme);
            } catch {
                /* a headless context can refuse storage; the app defaults to dark */
            }
            if (authenticated) document.cookie = "dim_auth=1; path=/";
        },
        [theme, authenticated],
    );
    return page;
}

/**
 * Waits for the page to stop moving. `networkidle` alone is not enough: the routes are
 * lazy chunks, so the first paint can be the Suspense fallback with the network already
 * quiet. Waiting for the fallback to disappear is what actually marks the route as
 * mounted; the short pause after it settles the library's entry transitions.
 */
async function settle(page) {
    await page.waitForLoadState("networkidle");
    await page
        .waitForFunction(() => !document.body.textContent.includes("Loading…"), null, {
            timeout: 5_000,
        })
        .catch(() => {});
    await page.waitForTimeout(500);
}

/**
 * Shrinks the viewport to the height the page actually fills.
 *
 * A fixed 900px viewport leaves the shorter pages half empty, and `fullPage: true` is not
 * the answer either: the sidebar is `h-full` inside a viewport-height flex row, so a
 * taller-than-viewport capture paints it against blank space below. Resizing the viewport
 * instead lets the layout lay itself out at the new height, so the chrome stays
 * full-bleed at any size.
 *
 * The measurement deliberately does not use `main.scrollHeight`: `main` is a flex child
 * that fills the viewport, and a scroll container never reports less than its own client
 * height -- on a short page it just echoes the height we are trying to replace. The
 * bottom edge of its last child is the real content end.
 */
async function fitToContent(page) {
    // CONTENT_MARGIN is passed in rather than closed over: the callback is serialised
    // and run inside the page, where this module's bindings do not exist.
    const needed = await page.evaluate((margin) => {
        const main = document.querySelector("main");
        if (!main) return document.documentElement.scrollHeight;

        const children = [...main.children];
        if (children.length === 0) return document.documentElement.scrollHeight;

        // getBoundingClientRect is viewport-relative, and `main` scrolls: add back
        // whatever is scrolled out of sight above.
        const bottom = Math.max(...children.map((c) => c.getBoundingClientRect().bottom));
        return bottom + main.scrollTop + margin;
    }, CONTENT_MARGIN);

    const height = Math.min(Math.max(Math.ceil(needed), MIN_HEIGHT), MAX_HEIGHT);
    await page.setViewportSize({ width: WIDTH, height });
    await page.waitForTimeout(250);
}

/**
 * The agent counterpart of fitToContent. Its pages have no `main`; they are one
 * `.container` card centred by the body's flex layout, so the card's own box is the only
 * thing worth measuring.
 */
async function fitToCard(page, margin) {
    const height = await page.evaluate((margin) => {
        const card = [...document.querySelectorAll(".container")].find(
            (c) => c.offsetParent !== null,
        );
        if (!card) return document.documentElement.scrollHeight;
        return Math.ceil(card.getBoundingClientRect().height) + margin * 2;
    }, margin);

    await page.setViewportSize({ width: AGENT_WIDTH, height });
    await page.waitForTimeout(250);
}

async function shoot(page, name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    const { width, height } = page.viewportSize();
    console.log(`  ✓ ${path.relative(REPO, file)}  (${width}x${height})`);
}

/**
 * The dashboard pages. Captured in both themes unless `themes` narrows it.
 *
 * Only the shots embedded on `docs/index.md` are pairs. That page is the site root, so a
 * relative path resolves identically for MkDocs and for GitHub, and it can carry the raw
 * HTML that switches the two on Material's `#only-light` / `#only-dark` markers. Every
 * other page sits a directory deep on the published site, where raw HTML would break --
 * those embed a single dark image, so there is no light variant worth capturing.
 *
 * `/client/:id` can be opened cold: until the client list arrives the route shows the list
 * instead of redirecting, and swaps to the detail page once the client is in the store.
 */
const DASHBOARD_SHOTS = [
    // The login screen is one centred card with no `main` around it, so fitToContent has
    // nothing to measure and it gets a canvas of its own instead.
    {
        name: "login",
        route: "/login",
        authenticated: false,
        themes: ["dark"],
        viewport: { width: 1000, height: 720 },
    },
    { name: "clients", route: "/clients" },
    { name: "client-detail", route: `/client/${fixtures.CLIENT_IDS.web}` },
    { name: "containers", route: "/containers" },
    { name: "images", route: "/images" },
    { name: "projects", route: "/projects" },
    { name: "notifications", route: "/notifications" },
];

/**
 * The agent's own pages. Single-themed on purpose: client/src/web/public/styles.css
 * defines one dark palette and no prefers-color-scheme block, so a light capture would be
 * byte-identical and the docs would carry two copies of the same picture.
 */
const AGENT_SHOTS = [
    { name: "agent-register", route: "/register", state: "unregistered" },
    { name: "agent-status", route: "/status", state: "registered" },
];

function buildFrontend() {
    console.log(`Building frontend at version ${PINNED_VERSION} …`);
    execFileSync("npm", ["run", "build", "-w", "server/frontend"], {
        cwd: REPO,
        stdio: "ignore",
        env: { ...process.env, VITE_APP_VERSION: PINNED_VERSION },
    });
}

async function main() {
    if (!process.argv.includes("--no-build")) {
        buildFrontend();
    }

    if (!fs.existsSync(path.join(SPA_ROOT, "index.html"))) {
        console.error(
            `No built frontend at ${path.relative(REPO, SPA_ROOT)}. ` +
                "Run `npm run build` first, or drop --no-build.",
        );
        process.exit(1);
    }

    fs.mkdirSync(OUT, { recursive: true });

    const spa = await serve({ root: SPA_ROOT, port: SPA_PORT, spaFallback: true });
    const agent = await serve({ root: AGENT_ROOT, port: AGENT_PORT });
    const browser = await chromium.launch();

    try {
        const context = await browser.newContext({
            viewport: { width: WIDTH, height: START_HEIGHT },
            deviceScaleFactor: SCALE,
            locale: "en-US",
            timezoneId: "UTC",
            reducedMotion: "reduce",
        });

        console.log("Dashboard:");
        for (const shot of DASHBOARD_SHOTS) {
            for (const theme of shot.themes ?? ["light", "dark"]) {
                const page = await newPage(context, {
                    theme,
                    authenticated: shot.authenticated !== false,
                });
                await mockDashboardApi(page);
                await page.setViewportSize(shot.viewport ?? { width: WIDTH, height: START_HEIGHT });
                await page.goto(`${spa.origin}${shot.route}`);
                await settle(page);
                if (!shot.viewport) await fitToContent(page);
                await shoot(page, `${shot.name}-${theme}`);
                await page.close();
            }
        }

        console.log("Client agent:");
        for (const shot of AGENT_SHOTS) {
            const page = await context.newPage();
            await page.setViewportSize({ width: AGENT_WIDTH, height: START_HEIGHT });
            await page.clock.setFixedTime(fixtures.FIXED_NOW);
            await mockAgentApi(page, shot.state);
            await page.goto(`${agent.origin}${shot.route}`);
            await settle(page);
            await fitToCard(page, AGENT_MARGIN);
            await shoot(page, shot.name);
            await page.close();
        }
    } finally {
        await browser.close();
        await spa.close();
        await agent.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
