import type { DockerContainer } from "@dim/shared";
import { humanDuration } from "../../utils";
import type { ContainerInstance, ContainerTreeNode } from "./hooks/useContainersData";

const HEALTH_SUFFIX: Record<string, string> = {
    healthy: " (healthy)",
    unhealthy: " (unhealthy)",
    starting: " (health: starting)",
};

/**
 * A container's status as `docker ps` writes it, at `now` (from `useNow`).
 *
 * The `status` Docker sends is a text frozen at the moment the agent took its state, and the
 * agent sends a new one only when something happens on the host -- a quiet host kept showing
 * "Up 4 hours" for a day. The duration is therefore derived here from the timestamps. Where
 * they are missing (an older agent, a stored state from before them) or the state has no
 * duration of its own, Docker's text is shown as it came.
 */
export function containerStatus(c: DockerContainer, now: number): string {
    const since = (iso: string | undefined) => {
        const t = iso ? Date.parse(iso) : NaN;
        // Clamped by humanDuration: the Docker host's clock may be ahead of the browser's.
        return Number.isNaN(t) ? null : humanDuration(now - t);
    };

    if (c.state === "running" || c.state === "paused") {
        const up = since(c.startedAt);
        if (!up) return c.status;
        if (c.state === "paused") return `Up ${up} (Paused)`;
        return `Up ${up}${HEALTH_SUFFIX[c.health ?? ""] ?? ""}`;
    }
    if (c.state === "exited") {
        const ago = since(c.finishedAt);
        if (!ago || c.exitCode === undefined) return c.status;
        return `Exited (${c.exitCode}) ${ago} ago`;
    }
    return c.status;
}

// `running` is not in here: StatusDot draws the live state itself, the same glowing dot a
// connected client gets. What is left is how the dot looks while the container is not running.
// Every list that draws a container's dot reads it from here -- the fleet-wide list, the
// container page, the client's and the image's tabs, the project's -- so a stopped container
// looks the same wherever it shows up.
// `unknown` is a hollow ring: an offline host's state is not known, which is not "stopped".
export const STATE_DOT: Record<string, string> = {
    exited: "bg-border",
    paused: "bg-warning",
    restarting: "bg-info animate-pulse",
    dead: "bg-error",
    created: "bg-accent",
    unknown: "bg-transparent border border-text-muted",
};

export const getNodeState = (node: ContainerTreeNode): string =>
    node.nodeType === "container"
        ? node.aggregateState
        : node.clientOnline ? node.containerState : "unknown";

/**
 * The containers a row can act on: every instance for a group row, the one for a client row --
 * but only where the host is connected. An action for an offline host has nobody to carry it
 * out, and its last snapshot says nothing about whether it would even apply.
 */
export function getInstances(node: ContainerTreeNode): ContainerInstance[] {
    const instances: ContainerInstance[] = node.nodeType === "container"
        ? node.instances
        : [{ clientId: node.clientId, containerId: node.containerId, state: node.containerState, clientOnline: node.clientOnline }];
    return instances.filter((i) => i.clientOnline);
}

/** The page of a container row. A client row opens the page of the container it belongs to. */
export function containerPath(node: ContainerTreeNode): string {
    const id = node.nodeType === "container" ? node.id : node.id.slice(0, node.id.lastIndexOf("||"));
    return `/container/${encodeURIComponent(id)}`;
}
