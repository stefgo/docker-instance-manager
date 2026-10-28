/**
 * Every message type on the server's sockets, grouped by who sends it to whom. The payloads
 * of the agent socket are typed in `AgentMessages` and `ServerMessages`, those of the
 * dashboard socket in `dashboardMessages.ts`.
 */
export const WS_EVENTS = {
    // ── Agent → Server ──────────────────────────────────────────────────────
    /** Opens the session: who the agent is and what it can do. */
    AUTH: "AUTH",
    /** State: the Docker inventory, sent after AUTH, on every Docker event and on request. */
    DOCKER_UPDATE: "DOCKER_UPDATE",
    /**
     * State: how the agent is doing -- where its auto-update schedules stand (last run, next
     * run, a run under way) and whether it reaches its Docker daemon. Sent after AUTH and
     * whenever any of it changes, including after a run that had nothing to do.
     */
    AGENT_STATUS: "AGENT_STATUS",
    /**
     * State: the registry answers of the last run of each auto-update schedule. Sent after
     * AUTH and whenever a run brought new ones. The server writes them into the cache its
     * update indicator reads, where only a newer answer wins.
     */
    IMAGE_CHECKS: "IMAGE_CHECKS",
    /** Events: a batch the agent has not had acknowledged yet. */
    ACTIVITY: "ACTIVITY",
    /** Events: container updates the agent has seen and not had acknowledged yet. */
    UPDATES: "UPDATES",
    /** Answer: the outcome of one DOCKER_ACTION, with its `actionId`. */
    DOCKER_ACTION_RESULT: "DOCKER_ACTION_RESULT",

    // ── Server → Agent ──────────────────────────────────────────────────────
    AUTH_SUCCESS: "AUTH_SUCCESS",
    AUTH_FAILURE: "AUTH_FAILURE",
    /** Runs one Docker action; answered with DOCKER_ACTION_RESULT. */
    DOCKER_ACTION: "DOCKER_ACTION",
    /** Asks for the Docker state to be read and sent again. */
    REQUEST_STATE_UPDATE: "REQUEST_STATE_UPDATE",
    /**
     * The auto-update policy, with every schedule already resolved. Sent after AUTH and again
     * whenever the settings, a project or the client's own schedule change -- the agent
     * stores it and decides for itself when to act on it.
     */
    AUTO_UPDATE_POLICY: "AUTO_UPDATE_POLICY",
    /**
     * Run the configured auto-update now, without waiting for a schedule. Carries no payload
     * -- what is to be updated is the agent's own reading of its host, and a run asked for by
     * hand differs from a scheduled one only in that nobody waited.
     */
    AUTO_UPDATE_RUN: "AUTO_UPDATE_RUN",
    /** The ids of ACTIVITY events it has stored, so the agent can drop them from its queue. */
    ACTIVITY_ACK: "ACTIVITY_ACK",
    /** The ids of UPDATES entries it has stored, so the agent can drop them from its queue. */
    UPDATES_ACK: "UPDATES_ACK",

    // ── Registration of an outbound agent (Server ↔ Agent on /ws/register) ──
    /** Server → Agent: the registration secret and the auth token the agent is to use. */
    REGISTRATION_REQUEST: "REGISTRATION_REQUEST",
    /** Agent → Server: the registration was accepted. */
    REGISTRATION_SUCCESS: "REGISTRATION_SUCCESS",
    /** Agent → Server: the secret did not match. */
    REGISTRATION_FAILURE: "REGISTRATION_FAILURE",

    // ── Server → Dashboard ──────────────────────────────────────────────────
    CLIENTS_UPDATE: "CLIENTS_UPDATE",
    /** The Docker state of one client. */
    DOCKER_STATE_UPDATE: "DOCKER_STATE_UPDATE",
    SCHEDULER_STATUS_UPDATE: "SCHEDULER_STATUS_UPDATE",
    /** The auto-update label as configured, so the container lists can show what carries it. */
    AUTO_UPDATE_LABEL_UPDATE: "AUTO_UPDATE_LABEL_UPDATE",
    PROJECTS_UPDATE: "PROJECTS_UPDATE",
    /** The current activity list. */
    ACTIVITY_UPDATE: "ACTIVITY_UPDATE",
    /**
     * Events stored for the first time, to be merged into the list the dashboard already
     * holds. A repeat the server already had is not sent again.
     */
    ACTIVITY_APPENDED: "ACTIVITY_APPENDED",
    /** `{ ids }` the user of this session has just seen. Sent to that user only. */
    ACTIVITY_SEEN: "ACTIVITY_SEEN",
    /**
     * Container updates stored for the first time, to be merged into the history the
     * dashboard already holds. A repeat the server already had is not sent again.
     */
    UPDATES_APPENDED: "UPDATES_APPENDED",

    // ── Internal ────────────────────────────────────────────────────────────
    ERROR: "ERROR",
} as const;

/**
 * What an agent says it can do, in the `capabilities` list of its AUTH payload. An agent
 * that predates a capability simply does not name it -- the server then knows not to expect
 * that behaviour of it, instead of inferring it from a version string it would have to keep
 * comparing.
 *
 * A new message does not earn an entry here. Both routers drop what they do not recognise,
 * so an agent that has never heard of a message simply does nothing with it, and that is
 * usually the correct outcome. A capability is added only where that silence would produce
 * either a wrong decision on the server -- one that assumes the agent acted -- or a question
 * to the operator that cannot be answered without knowing the agent's answer, such as
 * whether a schedule offered in the client form would ever be carried out.
 */
export const AGENT_CAPABILITIES = {
    /** Runs its own auto-update from the policy the server sends. */
    AUTO_UPDATE: "auto-update",
    /**
     * Evaluates project queries (projectQuery.ts). An agent without it would read a project
     * as a Compose stack name, so it is sent no projects at all.
     */
    PROJECT_QUERY: "project-query",
    /**
     * Reports the container updates on its host (`UPDATES`). Without it the update history
     * cannot tell a host where nothing was updated from one whose agent does not say.
     */
    UPDATE_HISTORY: "update-history",
    /** Runs `docker system prune` on the schedule the policy carries (`pruneCron`). */
    AUTO_PRUNE: "auto-prune",
} as const;

/**
 * Who caused a container update: the agent's auto-update, an action sent from the
 * dashboard, or something else on the host -- `docker compose up`, another tool, a person.
 */
export const UPDATE_TRIGGERS = ["auto", "manual", "external"] as const;

/** How a container update ended. Only an update the agent carried out itself can fail. */
export const UPDATE_RESULTS = ["updated", "failed"] as const;

/**
 * How long the update checks leave a registry alone after a rate limit (429) that came
 * without a `Retry-After` header. Docker Hub's window is six hours; an hour is a guess that
 * asks again well before that, but not on every tick.
 */
export const RATE_LIMIT_FALLBACK_SECONDS = 3600;

/**
 * The port an agent's local web server listens on unless its config.yaml names another.
 * The server appends it when an outbound target address is given without one, and the
 * agent falls back to it -- one number for both sides of the same default.
 */
export const DEFAULT_AGENT_PORT = 3001;

/**
 * How long an agent's self-update waits for the rest of its work to finish unless its
 * config.yaml says otherwise. Long enough for a pull of a large image, short enough that a
 * hung one does not hold the agent back for good.
 */
export const DEFAULT_SELF_UPDATE_WAIT_SECONDS = 600;

/**
 * How long the new container of an agent's self-update has to prove itself before the old one
 * is taken back. The agent image checks its health every 30 seconds, so less than a few of
 * those would roll back an update that was merely slow to report.
 */
export const DEFAULT_SELF_UPDATE_VERIFY_SECONDS = 120;

/**
 * The port the server listens on unless config.yaml or the DIM_SERVER_PORT environment variable
 * names another. It is the published one: the container exposes it and the compose files
 * map it, so an operator who moves the server has to move those with it.
 */
export const DEFAULT_SERVER_PORT = 3000;

/**
 * Whether the server currently holds a WebSocket to the agent. Deliberately binary:
 * ProxyService derives it from its map of open connections on every broadcast, and there
 * is no third state it could report. `busy` used to be listed here without anything ever
 * producing or reading it.
 */
export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
} as const;

/**
 * Which side opens the agent connection: `inbound` agents dial the server, `outbound`
 * agents are dialled by it. SQL strings and migrations keep the literals -- a migration
 * must not depend on today's code.
 */
export const CONNECTION_MODE = {
    INBOUND: "inbound",
    OUTBOUND: "outbound",
} as const;

/**
 * Every action the dashboard may ask an agent to run. Lives here rather than next to the
 * Docker types because the request schemas are built from it at module load, and
 * schemas.ts must not import types.ts, which imports schemas.ts.
 */
export const DOCKER_ACTION_TYPES = [
    "container:start",
    "container:stop",
    "container:restart",
    "container:remove",
    "container:pause",
    "container:unpause",
    "container:recreate",
    "image:remove",
    "image:pull",
    "image:update",
    "image:prune",
    "system:prune",
    "volume:remove",
    "network:remove",
] as const;

/**
 * The actions that act on the whole host and so take no `target`: `image:prune` removes the
 * images no container uses, `system:prune` is `docker system prune`.
 */
export const HOST_DOCKER_ACTIONS: ReadonlySet<(typeof DOCKER_ACTION_TYPES)[number]> = new Set([
    "image:prune",
    "system:prune",
]);

/**
 * Who put an event on the wire. The agent owns everything that happens on its host; the
 * server owns what only it can know -- whether an agent is connected, that one registered,
 * that a user asked for an action, and that its answer never came. The outcome of an action
 * is the agent's: it is the one side that knows it, however long the connection is down.
 */
export const ACTIVITY_SOURCES = ["agent", "server"] as const;

/**
 * Ordered by severity, lowest first -- `ACTIVITY_LEVELS.indexOf` compares two levels.
 * `trace` is routine bookkeeping, such as an agent connecting or disconnecting; the dashboard
 * hides it unless asked to show it.
 */
export const ACTIVITY_LEVELS = ["trace", "info", "warning", "error"] as const;

/**
 * Every kind of event this build knows how to phrase. It is *not* what the wire accepts:
 * an agent of another version may report a kind that is not in here, and dropping it would
 * lose a fact the agent went to the trouble of observing. The server stores whatever it is
 * handed and the dashboard falls back to a generic line for a kind it does not know -- which
 * is the whole point of events carrying structure instead of a sentence.
 */
export const ACTIVITY_KINDS = [
    // Reported by the agent, from the Docker event stream
    "container.created",
    "container.started",
    "container.stopped",
    "container.removed",
    "container.killed",
    "container.died",
    "container.oom",
    "container.health",
    "image.pulled",
    "image.removed",
    // Reported by the agent, about its own auto-update runs
    "autoupdate.run",
    "autoupdate.skipped",
    "autoupdate.interrupted",
    "autoupdate.refused",
    // Reported by the agent, about the outcome of replacing its own container
    "selfupdate.completed",
    "selfupdate.rolledback",
    "selfupdate.failed",
    "autoupdate.conflict",
    // Reported by the agent, about the outcome of an action the server sent it. The server
    // reports `action.failed` itself only for an agent too old to do so.
    "action.completed",
    "action.failed",
    // Reported by the server
    "client.connected",
    "client.disconnected",
    "client.registered",
    "action.requested",
    // The answer to an action never came: the connection closed or the time ran out. The
    // agent's own outcome, delivered late, supersedes it.
    "action.unconfirmed",
    "imagecheck.interrupted",
    "scheduler.failed",
] as const;

/** The HTTP methods a webhook may send with. Both carry a body; GET does not. */
export const WEBHOOK_METHODS = ["POST", "PUT"] as const;

/**
 * The background jobs the server runs on a timer. Each keeps one row in `scheduler_state`:
 * its last finished run and whatever it has to remember from one run to the next.
 */
export const SCHEDULER_IDS = [
    "image-update-check",
    "image-cache-cleanup",
    "notification-cleanup",
] as const;

/** Whether the timer started a run or a user did, through the settings page. */
export const SCHEDULER_TRIGGERS = ["schedule", "manual"] as const;

/**
 * How a finished run ended. `partial` finished but left work undone -- the image update
 * check when a registry's rate limit paused it; `interrupted` never finished, because the
 * server stopped while it ran.
 */
export const SCHEDULER_RUN_STATUSES = ["success", "partial", "failed", "interrupted"] as const;
