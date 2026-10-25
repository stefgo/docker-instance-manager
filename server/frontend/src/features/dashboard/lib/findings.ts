import {
    CLIENT_STATUS,
    containerNameOf,
    registryLabel,
    type Client,
    type ContainerUpdateRecord,
    type DockerState,
    type RegistryStatus,
} from "@dim/shared";
import { ROUTES, paths } from "../../../lib/paths";
import { clientName, humanDuration, plural } from "../../../utils";
import { awaitsRegistration } from "../../clients/lib/registration";
import { containerKey, type ContainerAssignment } from "../../projects/lib/projectMembers";
import { clientsWithoutHistory } from "../../updates/lib/updateHistory";

/**
 * What needs a look across the fleet right now, as the overview's "Needs attention" lists it.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark seen. That is what tells it from an error in
 * the activity, which records that something happened and stays until somebody has looked.
 * Everything is read from what the cache already holds and the socket keeps current.
 */

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

export interface Finding {
    /** What makes this finding this one: its type and what it is about. Not its text. */
    id: string;
    type: FindingType;
    severity: FindingSeverity;
    text: string;
    /** Where the reader can do something about it. */
    to?: string;
    /** Since when it is so, where that is known; ISO 8601. */
    since?: string | null;
    /** Until when it lasts by itself, for a pause; ISO 8601. */
    until?: string | null;
}

export interface FindingsInput {
    clients: readonly Client[];
    dockerStates: Readonly<Record<string, DockerState>>;
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

function containerFindings(client: Client, state: DockerState, assignment: FindingsInput["assignment"]): Finding[] {
    const host = clientName(client);
    const found: Finding[] = [];
    for (const container of state.containers) {
        const name = containerNameOf(container);
        const where = `${name} on ${host}`;
        const to = paths.containerInstance(client.id, name);
        const id = (type: FindingType) => `${type}:${client.id}:${name}`;

        if (container.state === "running" && container.health === "unhealthy") {
            found.push({ id: id("container-unhealthy"), type: "container-unhealthy", severity: "error", text: `${where} is unhealthy`, to });
        } else if (container.state === "restarting") {
            const code = container.exitCode !== undefined ? ` (exit code ${container.exitCode})` : "";
            found.push({
                id: id("container-restarting"),
                type: "container-restarting",
                severity: "error",
                text: `${where} keeps restarting${code}`,
                to,
            });
        } else if (container.state === "dead") {
            found.push({ id: id("container-dead"), type: "container-dead", severity: "error", text: `${where} is dead`, to });
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
                to,
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
                to,
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
            to: paths.containerInstance(update.clientId, update.containerName),
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
                to: paths.client(client.id),
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
                to: paths.client(client.id),
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
            to: paths.client(client.id),
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
            to: ROUTES.settings,
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

export const FLEET_STATUS: Record<FleetStatus, { label: string; description: string; tone: string }> = {
    healthy: { label: "Healthy", description: "Nothing needs attention.", tone: "text-success" },
    degraded: { label: "Degraded", description: "Something needs a look.", tone: "text-warning" },
    critical: { label: "Critical", description: "Something is broken.", tone: "text-error" },
    unknown: { label: "Unknown", description: "No client is registered yet.", tone: "text-text-muted" },
};

/** How the fleet is doing, by its worst finding. With no registered client nothing can be said. */
export function fleetStatus(findings: readonly Finding[], clients: readonly Client[]): FleetStatus {
    if (!clients.some((c) => !awaitsRegistration(c))) return "unknown";
    if (findings.some((f) => f.severity === "error")) return "critical";
    if (findings.length > 0) return "degraded";
    return "healthy";
}

/** "3 findings", or what the status means where there is none. */
export function findingSummary(findings: readonly Finding[], status: FleetStatus): string {
    return findings.length > 0 ? plural(findings.length, "finding") : FLEET_STATUS[status].description;
}

/** How long a finding has lasted, in a few words under it; null where that is not known. */
export function findingAge(finding: Pick<Finding, "since">, now: number): string | null {
    const since = finding.since ? Date.parse(finding.since) : NaN;
    if (Number.isNaN(since)) return null;
    return `For ${humanDuration(now - since).toLowerCase()}`;
}
