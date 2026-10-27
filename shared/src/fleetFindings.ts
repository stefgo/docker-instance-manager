import { AGENT_CAPABILITIES, CLIENT_STATUS, CONNECTION_MODE } from "./constants.js";
import { registryLabel } from "./imageCheck.js";
import {
    containerNameOf,
    resolveAssignment,
    type ProjectAssignment,
    type QueryHostState,
} from "./projectQuery.js";
import type { Client, ContainerUpdateRecord, DockerState, ProjectSummary, RegistryStatus } from "./types.js";

/**
 * What needs a look across the fleet right now, as the overview's "Needs attention" lists it
 * -- and as the server's status report (`GET /api/v1/status`) answers it. One implementation
 * for both, so the two cannot disagree. Where a finding leads is a `target` here; the
 * dashboard turns it into a link.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark seen. That is what tells it from an error in
 * the activity, which records that something happened and stays until somebody has looked.
 * Everything is read from what the cache already holds and the socket keeps current.
 */

/** A count with its noun: "1 host", "3 hosts". `many` for nouns without a plain -s plural. */
export const plural = (count: number, one: string, many = `${one}s`): string =>
    `${count} ${count === 1 ? one : many}`;

/**
 * How a client is named everywhere: its display name, or its hostname while it has none.
 * `||` rather than `??` on purpose: an empty display name must fall back as well.
 */
export const clientName = (client: { displayName?: string | null; hostname: string }): string =>
    client.displayName || client.hostname;

/**
 * Whether an inbound client still waits for its first agent. It is created when its token
 * is issued and has been seen by nobody since; an outbound client is only stored once the
 * server has reached its agent, so it never waits.
 */
export const awaitsRegistration = (client: Pick<Client, "connectionMode" | "lastSeen">): boolean =>
    client.connectionMode !== CONNECTION_MODE.OUTBOUND && !client.lastSeen;

/**
 * The connected clients whose agent does not report updates, so a quiet history is not read
 * as a quiet host. A client that is not connected names no capabilities and is left out:
 * what its agent can do is not known until it is back.
 */
export function clientsWithoutHistory<C extends Pick<Client, "status" | "capabilities">>(clients: readonly C[]): C[] {
    return clients.filter(
        (client) =>
            client.status === CLIENT_STATUS.ONLINE &&
            Array.isArray(client.capabilities) &&
            !client.capabilities.includes(AGENT_CAPABILITIES.UPDATE_HISTORY),
    );
}

/** What a container belongs to: one project, or several it conflicts between. */
export type ContainerAssignment = ProjectAssignment<ProjectSummary>;

/** The key a container is found under in an assignment: unique across the fleet. */
export function containerKey(clientId: string, containerId: string): string {
    return `${clientId}/${containerId}`;
}

/**
 * The project every container of the fleet belongs to, keyed by `containerKey` -- or the
 * projects it conflicts between. Containers in no project are not in the map. The server
 * and the agents resolve the same thing with the same function.
 */
export function projectAssignment(
    states: readonly QueryHostState[],
    projects: readonly ProjectSummary[],
): Map<string, ContainerAssignment> {
    const assignment = new Map<string, ContainerAssignment>();
    if (projects.length === 0) return assignment;
    for (const state of states) {
        for (const container of state.containers) {
            const resolved = resolveAssignment(projects, state.host, container);
            if (resolved.kind !== "none") {
                assignment.set(containerKey(state.clientId, container.id), resolved);
            }
        }
    }
    return assignment;
}

export type FindingSeverity = "error" | "warning";

/** Every kind of finding, in the order the list shows them within a severity: hosts first. */
const FINDING_TYPES = [
    "client-offline",
    "docker-unreachable",
    "agent-outdated",
    "registry-paused",
    "container-dead",
    "container-restarting",
    "container-unhealthy",
    "update-failed",
    "container-exited",
    "project-conflict",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

/** Where a finding can be dealt with: a page of the dashboard, named rather than linked. */
export type FindingTarget =
    | { kind: "client"; clientId: string }
    | { kind: "container"; clientId: string; name: string }
    | { kind: "settings" };

export interface Finding {
    /** What makes this finding this one: its type and what it is about. Not its text. */
    id: string;
    type: FindingType;
    severity: FindingSeverity;
    text: string;
    /** Where the reader can do something about it. */
    target?: FindingTarget;
    /** Since when it is so, where that is known; ISO 8601. */
    since?: string | null;
    /** Until when it lasts by itself, for a pause; ISO 8601. */
    until?: string | null;
}

export interface FindingsInput {
    clients: readonly Client[];
    dockerStates: Readonly<Record<string, Pick<DockerState, "containers">>>;
    /** The project assignment of every container, by `containerKey`. */
    assignment: ReadonlyMap<string, ContainerAssignment>;
    /** The update history, newest first; undefined while it is loading. */
    updates?: readonly ContainerUpdateRecord[];
    /** The registries of the image update check; undefined while unknown. */
    registries?: readonly RegistryStatus[];
    now: number;
}

/**
 * Exit codes a container ends with when somebody stopped it: none, SIGINT (130) and SIGTERM
 * (143). Anything else says the container ended on its own -- or would not stop in time.
 */
const STOPPED_ON_PURPOSE = new Set([0, 130, 143]);

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1 };

function containerFindings(client: Client, state: Pick<DockerState, "containers">, assignment: FindingsInput["assignment"]): Finding[] {
    const host = clientName(client);
    const found: Finding[] = [];
    for (const container of state.containers) {
        const name = containerNameOf(container);
        const where = `${name} on ${host}`;
        const target: FindingTarget = { kind: "container", clientId: client.id, name };
        const id = (type: FindingType) => `${type}:${client.id}:${name}`;

        if (container.state === "running" && container.health === "unhealthy") {
            found.push({ id: id("container-unhealthy"), type: "container-unhealthy", severity: "error", text: `${where} is unhealthy`, target });
        } else if (container.state === "restarting") {
            const code = container.exitCode !== undefined ? ` (exit code ${container.exitCode})` : "";
            found.push({
                id: id("container-restarting"),
                type: "container-restarting",
                severity: "error",
                text: `${where} keeps restarting${code}`,
                target,
            });
        } else if (container.state === "dead") {
            found.push({ id: id("container-dead"), type: "container-dead", severity: "error", text: `${where} is dead`, target });
        } else if (
            container.state === "exited" &&
            container.exitCode !== undefined &&
            !STOPPED_ON_PURPOSE.has(container.exitCode)
        ) {
            found.push({
                id: id("container-exited"),
                type: "container-exited",
                severity: "warning",
                text: `${where} exited with code ${container.exitCode}`,
                target,
                since: container.finishedAt ?? null,
            });
        }

        const assigned = assignment.get(containerKey(client.id, container.id));
        if (assigned?.kind === "conflict") {
            found.push({
                id: id("project-conflict"),
                type: "project-conflict",
                severity: "warning",
                text: `${where} matches ${plural(assigned.projects.length, "project")} and is auto-updated by none of them`,
                target,
            });
        }
    }
    return found;
}

/**
 * The update that failed last, per container that is still there and has not been updated
 * since. One retried with success, or a container that is gone, needs nothing more.
 */
function failedUpdates(
    updates: readonly ContainerUpdateRecord[],
    online: ReadonlyMap<string, Client>,
    dockerStates: FindingsInput["dockerStates"],
): Finding[] {
    const latest = new Map<string, ContainerUpdateRecord>();
    for (const update of updates) {
        const key = `${update.clientId}/${update.containerName}`;
        const known = latest.get(key);
        if (!known || update.occurredAt > known.occurredAt) latest.set(key, update);
    }
    const found: Finding[] = [];
    for (const update of latest.values()) {
        if (update.result !== "failed") continue;
        const client = online.get(update.clientId);
        const state = dockerStates[update.clientId];
        if (!client || !state?.containers.some((c) => containerNameOf(c) === update.containerName)) continue;
        const reason = update.error ? `: ${update.error}` : "";
        found.push({
            id: `update-failed:${update.clientId}:${update.containerName}`,
            type: "update-failed",
            severity: "error",
            text: `Update of ${update.containerName} on ${clientName(client)} failed${reason}`,
            target: { kind: "container", clientId: update.clientId, name: update.containerName },
            since: update.occurredAt,
        });
    }
    return found;
}

/**
 * Everything that needs a look: errors first, then by kind -- what is wrong with a host before
 * what is wrong with a container on it -- then by text. A container is judged only on a connected host:
 * the last snapshot of one that is gone is not its present, and the host's own finding says so.
 */
export function buildFindings({ clients, dockerStates, assignment, updates, registries, now }: FindingsInput): Finding[] {
    const found: Finding[] = [];
    const online = new Map<string, Client>();

    for (const client of clients) {
        if (awaitsRegistration(client)) continue;
        const host = clientName(client);
        if (client.status !== CLIENT_STATUS.ONLINE) {
            found.push({
                id: `client-offline:${client.id}`,
                type: "client-offline",
                severity: "error",
                text: client.lastSeen ? `${host} is offline` : `${host} has never connected`,
                target: { kind: "client", clientId: client.id },
                since: client.lastSeen ?? null,
            });
            continue;
        }
        online.set(client.id, client);
        if (client.docker && !client.docker.reachable) {
            const reason = client.docker.error ? `: ${client.docker.error}` : "";
            found.push({
                id: `docker-unreachable:${client.id}`,
                type: "docker-unreachable",
                severity: "error",
                text: `${host} cannot reach Docker${reason}`,
                target: { kind: "client", clientId: client.id },
                since: client.docker.since,
            });
            // What the agent last read of Docker is no longer its present either.
            continue;
        }
        const state = dockerStates[client.id];
        if (state) found.push(...containerFindings(client, state, assignment));
    }

    if (updates) found.push(...failedUpdates(updates, online, dockerStates));

    for (const client of clientsWithoutHistory([...online.values()])) {
        found.push({
            id: `agent-outdated:${client.id}`,
            type: "agent-outdated",
            severity: "warning",
            text: `The agent on ${clientName(client)}${client.version ? ` (${client.version})` : ""} does not report container updates`,
            target: { kind: "client", clientId: client.id },
        });
    }

    for (const registry of registries ?? []) {
        const until = registry.pausedUntil ? Date.parse(registry.pausedUntil) : NaN;
        if (Number.isNaN(until) || until <= now) continue;
        found.push({
            id: `registry-paused:${registry.registry}`,
            type: "registry-paused",
            severity: "warning",
            text: `Update checks at ${registryLabel(registry.registry)} are paused by a rate limit`,
            target: { kind: "settings" },
            until: registry.pausedUntil,
        });
    }

    return found.sort(
        (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            FINDING_TYPES.indexOf(a.type) - FINDING_TYPES.indexOf(b.type) ||
            a.text.localeCompare(b.text, undefined, { sensitivity: "base" }),
    );
}

export type FleetStatus = "healthy" | "degraded" | "critical" | "unknown";

/** How the fleet is doing, by its worst finding. With no registered client nothing can be said. */
export function fleetStatus(
    findings: readonly Pick<Finding, "severity">[],
    clients: readonly Pick<Client, "connectionMode" | "lastSeen">[],
): FleetStatus {
    if (!clients.some((c) => !awaitsRegistration(c))) return "unknown";
    if (findings.some((f) => f.severity === "error")) return "critical";
    if (findings.length > 0) return "degraded";
    return "healthy";
}

/** How many of the clients are online, of how many. */
export interface OnlineCount {
    online: number;
    total: number;
}

/** How many clients are online: the dashboard's card, the sidebar's badge and the status report count with this. */
export const clientCount = (clients: readonly { status?: string | null }[]): OnlineCount => ({
    online: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
    total: clients.length,
});
