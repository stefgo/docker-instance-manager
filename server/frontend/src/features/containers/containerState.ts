import type { DockerContainer } from "@dim/shared";
import type { StatusDotTone } from "@stefgo/react-ui-components";
import { humanDuration } from "../../utils";
import type { ContainerInstance, ContainerTreeNode } from "./hooks/useContainersData";
import { paths } from "../../lib/paths";

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
 * Without a timestamp -- a container that never started, or one the agent could not
 * inspect -- the text goes without its duration ("Up", "Exited (0)") rather than showing one
 * that is wrong.
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

// The role each state plays in a dot. Every list that draws a container's dot reads it from
// here -- the fleet-wide list, the container page, the client's and the image's tabs, the
// project's -- so a stopped container looks the same wherever it shows up.
// `unknown` is a hollow ring: an offline host's state is not known, which is not "stopped".
const STATE_TONE: Record<string, StatusDotTone> = {
    running: "success",
    exited: "neutral",
    paused: "warning",
    restarting: "info",
    dead: "error",
    created: "accent",
    unknown: "unknown",
};

/**
 * How the dot of a container in `state` looks, as the props of `StatusDot`. A running
 * container gets the same glowing dot a connected client gets; one that is restarting pulses
 * too, since it is on its way somewhere. A state without an entry -- the `stopped` and
 * `mixed` of a group row, or one Docker adds -- is drawn like a stopped container.
 */
export function stateDot(state: string): { tone: StatusDotTone; pulse?: boolean } {
    const tone = STATE_TONE[state] ?? "neutral";
    return state === "restarting" ? { tone, pulse: true } : { tone };
}

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

/**
 * The page of a container row. A client row opens the page of its instance: the container on
 * that host, addressed by its name -- unique per host -- rather than by the Docker id, which
 * every recreate replaces.
 */
export function containerPath(node: ContainerTreeNode): string {
    if (node.nodeType === "container") return paths.container(node.id);
    return paths.containerInstance(node.clientId, node.containerName);
}
