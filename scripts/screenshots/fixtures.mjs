/**
 * The demo data every screenshot is taken of.
 *
 * These are plain objects rather than JSON files on purpose: half the values are
 * timestamps, and they have to be expressed *relative* to the frozen clock in
 * capture.mjs. A stored JSON file would carry absolute dates, and an uptime of "Up 3 days"
 * would silently turn into "Up 4 months" as the file aged.
 *
 * The shapes follow shared/src/schemas.ts and shared/src/types.ts. Nothing type-checks
 * them, because the interception in capture.mjs answers with them as raw JSON; when an API
 * shape changes, this file has to be corrected by hand. See README.md.
 */
import { createHash } from "crypto";

/** The instant every screenshot is taken at. Any date below is measured from here. */
export const FIXED_NOW = new Date("2026-09-15T09:32:00.000Z");

const ago = (ms) => new Date(FIXED_NOW.getTime() - ms).toISOString();
const agoSeconds = (ms) => Math.floor((FIXED_NOW.getTime() - ms) / 1000);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A stable sha256 per name, so digests and ids do not change between runs. */
const sha = (seed) => createHash("sha256").update(seed).digest("hex");

/** The label the settings enrol containers into auto-update with. */
export const AUTO_UPDATE_LABEL = "dim.auto-update=true";
const AUTO_UPDATE = { "dim.auto-update": "true" };

const COMPOSE = "com.docker.compose.project";

/** `GET /api/v1/me`. */
export const me = { id: 1, username: "admin", expiresAt: null };

// ── Clients ──────────────────────────────────────────────────────────────────

export const CLIENT_IDS = {
    web: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    db: "2c8e7ade-cade-4c3e-8c6e-bc9efcced5fe",
    media: "3da9f8be-dbef-4d4f-9d7f-cdaf0ddef60a",
    nas: "4eb0091f-ecf0-4e50-ae80-de0b1eef071b",
};

const AGENT_VERSION = "0.2.0";
const CAPABILITIES = ["auto-update", "activity"];

export const clients = [
    {
        id: CLIENT_IDS.web,
        hostname: "web-01.example.lan",
        displayName: "Web Frontend",
        status: "online",
        lastSeen: ago(12 * 1000),
        version: AGENT_VERSION,
        connectionMode: "inbound",
        inboundAllowedIp: "10.20.0.0/24",
        inboundLastIp: "10.20.0.14",
        autoUpdateCron: null,
        capabilities: CAPABILITIES,
    },
    {
        id: CLIENT_IDS.db,
        hostname: "db-01.example.lan",
        displayName: "Database",
        status: "online",
        lastSeen: ago(8 * 1000),
        version: AGENT_VERSION,
        connectionMode: "inbound",
        inboundAllowedIp: "10.20.0.21",
        inboundLastIp: "10.20.0.21",
        autoUpdateCron: "0 4 * * 0",
        capabilities: CAPABILITIES,
    },
    {
        id: CLIENT_IDS.media,
        hostname: "media-01.example.lan",
        displayName: "Media Server",
        status: "online",
        lastSeen: ago(3 * 1000),
        version: AGENT_VERSION,
        connectionMode: "outbound",
        outboundTargetAddress: "10.20.1.30:3001",
        autoUpdateCron: null,
        capabilities: CAPABILITIES,
    },
    {
        id: CLIENT_IDS.nas,
        hostname: "nas-01.example.lan",
        displayName: "Backup NAS",
        status: "offline",
        lastSeen: ago(3 * HOUR + 17 * MIN),
        version: "0.1.4",
        connectionMode: "inbound",
        inboundAllowedIp: "10.20.2.0/24",
        inboundLastIp: "10.20.2.5",
        autoUpdateCron: "",
        capabilities: null,
    },
];

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * One entry per image reference. The id and the digest are derived from the reference, so
 * an image on two hosts has the same id and digest on both -- which is what lets the image
 * list fold them into one row, exactly as it does for a real fleet.
 *
 * `update` is the result of the last registry check: true, false, or absent (never checked).
 */
const IMAGE_CATALOG = {
    "nginx:1.27-alpine": { size: 48_300_000, createdAgo: 34 * DAY, update: true },
    "traefik:v3.1": { size: 181_000_000, createdAgo: 21 * DAY, update: false },
    "ghcr.io/example/shop-frontend:2.4.1": { size: 212_000_000, createdAgo: 6 * DAY, update: false },
    "ghcr.io/example/shop-api:2.4.1": { size: 164_000_000, createdAgo: 6 * DAY, update: false },
    "redis:7.4-alpine": { size: 41_200_000, createdAgo: 48 * DAY, update: true },
    "postgres:16.4": { size: 432_000_000, createdAgo: 62 * DAY, update: true },
    "dpage/pgadmin4:8.11": { size: 489_000_000, createdAgo: 29 * DAY, update: false },
    "prometheuscommunity/postgres-exporter:v0.15.0": { size: 23_800_000, createdAgo: 90 * DAY },
    "lscr.io/linuxserver/jellyfin:10.9.11": { size: 796_000_000, createdAgo: 12 * DAY, update: false },
    "lscr.io/linuxserver/sonarr:4.0.9": { size: 204_000_000, createdAgo: 17 * DAY, update: true },
    "lscr.io/linuxserver/radarr:5.9.1": { size: 198_000_000, createdAgo: 17 * DAY, update: false },
    "portainer/agent:2.21.2": { size: 171_000_000, createdAgo: 40 * DAY, update: false },
    "restic/restic:0.17.1": { size: 49_600_000, createdAgo: 55 * DAY },
    "containrrr/watchtower:1.7.1": { size: 16_900_000, createdAgo: 400 * DAY },
};

function repositoryOf(ref) {
    return ref.slice(0, ref.lastIndexOf(":"));
}

/** The `org.opencontainers.image.*` labels an image carries, as far as the pages show them. */
function ociLabels(ref, version, createdAgo) {
    return {
        "org.opencontainers.image.source": `https://github.com/example/${repositoryOf(ref).split("/").pop()}`,
        "org.opencontainers.image.version": version,
        "org.opencontainers.image.created": ago(createdAgo),
    };
}

function image(ref) {
    const entry = IMAGE_CATALOG[ref];
    const digest = `sha256:${sha(`digest:${ref}`)}`;
    const result = {
        id: `sha256:${sha(`image:${ref}`)}`,
        parentId: "",
        repoTags: [ref],
        repoDigests: [`${repositoryOf(ref)}@${digest}`],
        created: agoSeconds(entry.createdAgo),
        size: entry.size,
        labels: ociLabels(ref, ref.slice(ref.lastIndexOf(":") + 1), entry.createdAgo),
        platform: { os: "linux", architecture: "amd64" },
    };
    if (entry.update !== undefined) {
        result.updateCheck = {
            hasUpdate: entry.update,
            remoteDigest: entry.update ? `sha256:${sha(`remote:${ref}`)}` : digest,
            checkedAt: ago(2 * HOUR + 4 * MIN),
        };
        // The registry's labels are fetched for an image with an update only: they describe
        // the image the update would bring, which the image and container pages show.
        if (entry.update) {
            result.updateCheck.remoteLabels = ociLabels(ref, `${ref.slice(ref.lastIndexOf(":") + 1)}-r1`, 3 * DAY);
        }
    }
    return result;
}

// ── Containers ───────────────────────────────────────────────────────────────

/**
 * A container, from the few facts that differ between them. `up` is how long it has been
 * running, `down` how long ago a stopped one exited.
 */
function container(clientKey, name, ref, opts = {}) {
    const {
        state = "running",
        up = 3 * DAY,
        down,
        exitCode = 0,
        health,
        ports = [],
        compose,
        labels = {},
    } = opts;

    const started = state === "running" || state === "paused" ? up : (down ?? 0) + 2 * DAY;
    const result = {
        id: sha(`container:${clientKey}:${name}`),
        names: [`/${name}`],
        image: ref,
        imageId: `sha256:${sha(`image:${ref}`)}`,
        command: "/docker-entrypoint.sh",
        created: agoSeconds(started + 10 * MIN),
        state,
        startedAt: ago(started),
        ports,
        labels: { ...(compose ? { [COMPOSE]: compose } : {}), ...labels },
        configImage: ref,
    };
    if (health) result.health = health;
    if (state === "exited") {
        result.finishedAt = ago(down ?? HOUR);
        result.exitCode = exitCode;
    }
    return result;
}

const tcp = (privatePort, publicPort) => ({
    ip: "0.0.0.0",
    privatePort,
    publicPort,
    type: "tcp",
});

const CONTAINERS = {
    web: [
        container("web", "traefik", "traefik:v3.1", {
            up: 11 * DAY,
            ports: [tcp(80, 80), tcp(443, 443)],
            compose: "edge",
            labels: AUTO_UPDATE,
        }),
        container("web", "shop-frontend", "ghcr.io/example/shop-frontend:2.4.1", {
            up: 6 * DAY,
            health: "healthy",
            compose: "shop",
            labels: AUTO_UPDATE,
        }),
        container("web", "shop-api", "ghcr.io/example/shop-api:2.4.1", {
            up: 6 * DAY,
            health: "healthy",
            ports: [tcp(8080, 8080)],
            compose: "shop",
            labels: AUTO_UPDATE,
        }),
        container("web", "shop-cache", "redis:7.4-alpine", {
            up: 6 * DAY,
            compose: "shop",
        }),
        container("web", "static-assets", "nginx:1.27-alpine", {
            up: 2 * DAY + 5 * HOUR,
            ports: [tcp(80, 8081)],
            labels: AUTO_UPDATE,
        }),
        container("web", "portainer-agent", "portainer/agent:2.21.2", {
            up: 11 * DAY,
            ports: [tcp(9001, 9001)],
        }),
    ],
    db: [
        container("db", "postgres", "postgres:16.4", {
            up: 23 * DAY,
            health: "healthy",
            ports: [tcp(5432, 5432)],
            compose: "database",
        }),
        container("db", "postgres-exporter", "prometheuscommunity/postgres-exporter:v0.15.0", {
            up: 23 * DAY,
            ports: [tcp(9187, 9187)],
            compose: "database",
        }),
        container("db", "pgadmin", "dpage/pgadmin4:8.11", {
            state: "exited",
            down: 5 * HOUR,
            exitCode: 0,
            ports: [tcp(80, 5050)],
            compose: "database",
        }),
        container("db", "session-cache", "redis:7.4-alpine", {
            up: 23 * DAY,
            ports: [tcp(6379, 6379)],
        }),
        container("db", "portainer-agent", "portainer/agent:2.21.2", {
            up: 23 * DAY,
            ports: [tcp(9001, 9001)],
        }),
    ],
    media: [
        container("media", "jellyfin", "lscr.io/linuxserver/jellyfin:10.9.11", {
            up: 4 * DAY,
            health: "healthy",
            ports: [tcp(8096, 8096)],
            compose: "media",
            labels: AUTO_UPDATE,
        }),
        container("media", "sonarr", "lscr.io/linuxserver/sonarr:4.0.9", {
            up: 4 * DAY,
            ports: [tcp(8989, 8989)],
            compose: "media",
            labels: AUTO_UPDATE,
        }),
        container("media", "radarr", "lscr.io/linuxserver/radarr:5.9.1", {
            state: "paused",
            up: 4 * DAY,
            ports: [tcp(7878, 7878)],
            compose: "media",
            labels: AUTO_UPDATE,
        }),
        container("media", "reverse-proxy", "nginx:1.27-alpine", {
            up: 9 * DAY,
            ports: [tcp(80, 80), tcp(443, 443)],
            labels: AUTO_UPDATE,
        }),
        container("media", "watchtower", "containrrr/watchtower:1.7.1", {
            state: "exited",
            down: 2 * DAY,
            exitCode: 1,
        }),
    ],
    nas: [
        container("nas", "restic-backup", "restic/restic:0.17.1", { up: 14 * DAY }),
        container("nas", "portainer-agent", "portainer/agent:2.21.2", {
            up: 14 * DAY,
            ports: [tcp(9001, 9001)],
        }),
    ],
};

// ── Volumes and networks ─────────────────────────────────────────────────────

function volume(name, compose) {
    return {
        name,
        driver: "local",
        mountpoint: `/var/lib/docker/volumes/${name}/_data`,
        createdAt: ago(40 * DAY),
        labels: compose ? { [COMPOSE]: compose } : null,
        scope: "local",
    };
}

function network(clientKey, name, driver, subnet, compose) {
    return {
        id: sha(`network:${clientKey}:${name}`),
        name,
        driver,
        scope: "local",
        ipam: {
            driver: "default",
            config: subnet ? [{ subnet, gateway: subnet.replace(/0\/\d+$/, "1") }] : [],
        },
        internal: false,
        attachable: false,
        labels: compose ? { [COMPOSE]: compose } : null,
        created: ago(40 * DAY),
    };
}

const baseNetworks = (key) => [
    network(key, "bridge", "bridge", "172.17.0.0/16"),
    network(key, "host", "host"),
    network(key, "none", "null"),
];

const VOLUMES = {
    web: [volume("edge_certificates", "edge"), volume("shop_uploads", "shop")],
    db: [volume("database_pgdata", "database"), volume("database_pgadmin", "database")],
    media: [volume("media_config", "media"), volume("media_cache", "media")],
    nas: [volume("restic_cache")],
};

const NETWORKS = {
    web: [
        ...baseNetworks("web"),
        network("web", "edge_default", "bridge", "172.20.0.0/16", "edge"),
        network("web", "shop_default", "bridge", "172.21.0.0/16", "shop"),
    ],
    db: [
        ...baseNetworks("db"),
        network("db", "database_default", "bridge", "172.22.0.0/16", "database"),
    ],
    media: [
        ...baseNetworks("media"),
        network("media", "media_default", "bridge", "172.23.0.0/16", "media"),
    ],
    nas: baseNetworks("nas"),
};

function dockerState(key) {
    const refs = [...new Set(CONTAINERS[key].map((c) => c.image))];
    return {
        containers: CONTAINERS[key],
        images: refs.map(image),
        volumes: VOLUMES[key],
        networks: NETWORKS[key],
        updatedAt: ago(key === "nas" ? 3 * HOUR + 17 * MIN : 40 * 1000),
    };
}

/** `GET /api/v1/clients/:id/docker`, keyed by client id. */
export const dockerStates = Object.fromEntries(
    Object.entries(CLIENT_IDS).map(([key, id]) => [id, dockerState(key)]),
);

// ── Projects ─────────────────────────────────────────────────────────────────

const criterion = (id, field, value, join = "and", op = "equals") => ({
    id,
    join,
    field,
    op,
    negate: false,
    value,
});

const PROJECT_IDS = {
    shop: "prj-shop",
    media: "prj-media",
    database: "prj-database",
};

/**
 * `GET /api/v1/projects`. The counts are the server's reading of the Docker state above;
 * they are written out rather than computed because the server's resolver lives in the
 * backend, and a screenshot has no business depending on it.
 */
export const projects = {
    projects: [
        {
            id: PROJECT_IDS.shop,
            name: "Online Shop",
            query: [criterion("c1", "container.name", "shop-*", "and", "wildcard")],
            autoUpdate: true,
            cron: "0 3 * * *",
            createdAt: ago(80 * DAY),
            clientIds: [CLIENT_IDS.web],
            containerCount: 3,
            imageCount: 3,
            conflictCount: 0,
        },
        {
            id: PROJECT_IDS.media,
            name: "Media Stack",
            query: [
                criterion("c1", "client.hostname", "media-*", "and", "wildcard"),
                criterion("c2", "image.name", "lscr.io/linuxserver/*", "and", "wildcard"),
            ],
            autoUpdate: true,
            cron: null,
            createdAt: ago(60 * DAY),
            clientIds: [CLIENT_IDS.media],
            containerCount: 3,
            imageCount: 3,
            conflictCount: 0,
        },
        {
            id: PROJECT_IDS.database,
            name: "Database",
            query: [
                criterion("c1", "container.name", "postgres*", "and", "wildcard"),
                criterion("c2", "container.name", "pgadmin", "or"),
            ],
            autoUpdate: false,
            cron: null,
            createdAt: ago(75 * DAY),
            clientIds: [CLIENT_IDS.db],
            containerCount: 3,
            imageCount: 3,
            conflictCount: 0,
        },
    ],
};

// ── Activity ─────────────────────────────────────────────────────────────────

const clientName = (key) => clients.find((c) => c.id === CLIENT_IDS[key]).displayName;

let activitySeq = 0;
function event(key, kind, level, occurredAgo, extra = {}) {
    activitySeq += 1;
    const occurredAt = ago(occurredAgo);
    return {
        id: `evt-${String(activitySeq).padStart(4, "0")}`,
        occurredAt,
        receivedAt: occurredAt,
        source: kind.startsWith("client.") || kind.startsWith("action.") ? "server" : "agent",
        clientId: CLIENT_IDS[key],
        kind,
        level,
        correlationId: extra.correlationId ?? null,
        subject: extra.subject ?? null,
        data: { clientName: clientName(key), ...(extra.data ?? {}) },
        seen: extra.seen ?? false,
    };
}

const RUN_MEDIA = "run-media-0915";
const ACTION_WEB = "act-web-0915";

/** `GET /api/v1/activity`, newest first -- the order the server returns it in. */
export const activity = [
    event("web", "action.requested", "info", 14 * MIN, {
        correlationId: ACTION_WEB,
        subject: { containerName: "static-assets" },
        data: { action: "container:restart" },
    }),
    event("web", "container.stopped", "info", 14 * MIN - 2000, {
        correlationId: ACTION_WEB,
        subject: { containerName: "static-assets" },
    }),
    event("web", "container.started", "info", 14 * MIN - 4000, {
        correlationId: ACTION_WEB,
        subject: { containerName: "static-assets" },
    }),
    event("media", "container.died", "error", 2 * HOUR + 11 * MIN, {
        subject: { containerName: "watchtower" },
        data: { exitCode: 1 },
    }),
    event("nas", "client.disconnected", "warning", 3 * HOUR + 17 * MIN),
    event("media", "autoupdate.run", "info", 6 * HOUR + 28 * MIN, {
        correlationId: RUN_MEDIA,
        data: { eligible: 5, updated: 2, failed: 0, skipped: 0 },
        seen: true,
    }),
    event("media", "image.pulled", "info", 6 * HOUR + 31 * MIN, {
        correlationId: RUN_MEDIA,
        subject: {
            imageRef: "lscr.io/linuxserver/jellyfin:10.9.11",
            projectIds: [PROJECT_IDS.media],
        },
        seen: true,
    }),
    event("media", "image.pulled", "info", 6 * HOUR + 32 * MIN, {
        correlationId: RUN_MEDIA,
        subject: { imageRef: "nginx:1.27-alpine" },
        seen: true,
    }),
    event("db", "container.stopped", "info", 5 * HOUR, {
        subject: { containerName: "pgadmin", projectIds: [PROJECT_IDS.database] },
        seen: true,
    }),
    event("db", "container.health", "warning", 9 * HOUR, {
        subject: { containerName: "postgres", projectIds: [PROJECT_IDS.database] },
        data: { status: "unhealthy" },
        seen: true,
    }),
    event("db", "container.health", "info", 9 * HOUR - 3 * MIN, {
        subject: { containerName: "postgres", projectIds: [PROJECT_IDS.database] },
        data: { status: "healthy" },
        seen: true,
    }),
    event("web", "client.connected", "trace", 11 * DAY, { seen: true }),
].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

// ── Everything else the shell asks for ───────────────────────────────────────

export const authConfig = { type: "local" };

export const users = [
    { id: 1, username: "admin", auth_methods: "local", created_at: ago(120 * DAY) },
    { id: 2, username: "operator", auth_methods: "local,oidc", created_at: ago(40 * DAY) },
];

export const tokens = [];

/** `GET /api/v1/settings/cleanup`: the defaults, with a fleet-wide auto-update schedule. */
export const settings = {
    token_retention_days: "30",
    token_cleanup_interval_hours: "24",
    image_version_cache_ttl_days: "30",
    image_version_cache_cleanup_orphans: "true",
    image_version_cache_cleanup_interval_hours: "24",
    image_update_check_interval_seconds: "3600",
    container_auto_update_cron: "0 4 * * *",
    container_auto_update_label: AUTO_UPDATE_LABEL,
    container_auto_update_delay_label: "dim.auto-update-delay",
    notification_retention_days: "90",
    notification_retention_count: "500",
    notification_cleanup_interval_hours: "24",
};

const finishedRun = (startedAgo, result) => ({
    trigger: "schedule",
    status: "success",
    startedAt: ago(startedAgo),
    finishedAt: ago(startedAgo - 4000),
    result,
    error: null,
});

const registry = (name, targets) => ({
    registry: name,
    targets,
    checked: targets,
    lastCheckedAt: ago(2 * HOUR + 4 * MIN),
    pausedUntil: null,
    remaining: null,
    error: null,
});

/** `GET /api/v1/settings/scheduler-status`. */
export const schedulerStatus = {
    schedulers: {
        "image-update-check": {
            isRunning: false,
            nextRun: ago(-(56 * MIN)),
            lastRun: finishedRun(2 * HOUR + 4 * MIN, { checked: 12, total: 12, pausedRegistries: [] }),
            registries: [
                registry("registry-1.docker.io", 7),
                registry("ghcr.io", 2),
                registry("lscr.io", 3),
            ],
        },
        "image-cache-cleanup": {
            isRunning: false,
            nextRun: ago(-(14 * HOUR)),
            lastRun: finishedRun(10 * HOUR, { orphansRemoved: 2, expiredRemoved: 0 }),
        },
        "notification-cleanup": {
            isRunning: false,
            nextRun: ago(-(14 * HOUR)),
            lastRun: finishedRun(10 * HOUR, { removed: 0 }),
        },
        "token-cleanup": {
            isRunning: false,
            nextRun: ago(-(14 * HOUR)),
            lastRun: finishedRun(10 * HOUR, { removed: 1 }),
        },
    },
};

// ── The agent's own web UI ───────────────────────────────────────────────────

/**
 * What the agent's local web server answers on its /api/status/* routes, for the two
 * states worth showing: a fresh agent waiting to be registered, and one that is connected.
 */
export const agent = {
    unregistered: {
        "/api/status/auth": { hasAuthToken: false },
        "/api/status/server": { serverUrl: "https://dim.example.lan", serverReachable: true },
        "/api/status/connection": { connected: false },
        "/api/status/config": {
            hasRegistrationSecret: false,
            hasAuthToken: false,
            hasServerUrl: false,
            registerPage: true,
        },
    },
    registered: {
        "/api/status/auth": { hasAuthToken: true },
        "/api/status/server": { serverUrl: "https://dim.example.lan", serverReachable: true },
        "/api/status/connection": { connected: true },
        "/api/status/config": {
            hasRegistrationSecret: false,
            hasAuthToken: true,
            hasServerUrl: true,
            registerPage: true,
        },
    },
};
