import type { DockerContainer } from "@dim/shared";
import { humanDuration } from "../../utils";
import type { ContainerInstance, ContainerTreeNode } from "./hooks/useContainersData";

const HEALTH_SUFFIX: Record<string, string> = {
    healthy: " (healthy)",
    unhealthy: " (unhealthy)",
    starting: " (health: starting)",
};

/**
 * A container's status as `docker ps` writes it, at `now` (from `useNow`) -- the rules of
 * Docker's own `State.String()`.
 *
 * The agent does not send Docker's text: it is frozen at the moment the state is taken, and
 * a new state comes only when something happens on the host, so a quiet host kept showing
 * "Up 4 hours" for a day. It sends the timestamps instead, and the duration is derived here.
 * An older agent or a state stored before them has none; the text then goes without its
 * duration ("Up", "Exited (0)") rather than showing one that is wrong.
 */
export function containerStatus(c: DockerContainer, now: number): string {
    const since = (iso: string | undefined) => {
        const t = iso ? Date.parse(iso) : NaN;
        // Clamped by humanDuration: the Docker host's clock may be ahead of the browser's.
        return Number.isNaN(t) ? "" : ` ${humanDuration(now - t)}`;
    };
    const ago = (iso: string | undefined) => {
        const d = since(iso);
        return d && `${d} ago`;
    };
    const code = c.exitCode === undefined ? "" : ` (${c.exitCode})`;

    switch (c.state) {
        case "running":
            return `Up${since(c.startedAt)}${HEALTH_SUFFIX[c.health ?? ""] ?? ""}`;
        case "paused":
            return `Up${since(c.startedAt)} (Paused)`;
        case "restarting":
            return `Restarting${code}${ago(c.finishedAt)}`;
        case "exited":
            return `Exited${code}${ago(c.finishedAt)}`;
        case "created":
            return "Created";
        case "removing":
            return "Removal In Progress";
        case "dead":
            return "Dead";
        default:
            return c.state;
    }
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
