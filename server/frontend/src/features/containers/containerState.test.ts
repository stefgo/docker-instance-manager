import { describe, expect, it } from "vitest";
import type { DockerContainer } from "@dim/shared";
import { NOT_ENROLLED } from "./autoUpdate";
import {
    containerPath,
    containerStatus,
    getInstances,
    getNodeState,
    restartTargets,
    startTargets,
    stateBadge,
    stateDot,
    stopTargets,
} from "./containerState";
import type { ClientNode, ContainerNode } from "./lib/containerGroups";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();

const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "c1",
    names: ["/web"],
    image: "nginx:1.27",
    imageId: "sha256:aaa",
    command: "",
    created: 0,
    state: "running",
    ports: [],
    labels: {},
    ...over,
});

const clientNode = (over: Partial<ClientNode> = {}): ClientNode => ({
    id: "web::h1",
    nodeType: "client",
    clientName: "docker-01",
    clientId: "h1",
    configImage: "nginx:1.27",
    clientIds: ["h1"],
    repoDigests: [],
    updateStatus: "none",
    containerId: "c1",
    containerState: "running",
    containerName: "web",
    clientOnline: true,
    autoUpdate: NOT_ENROLLED,
    ...over,
});

const containerNode = (over: Partial<ContainerNode> = {}): ContainerNode => ({
    id: "web",
    nodeType: "container",
    name: "web",
    configImage: "nginx:1.27",
    clientCount: 2,
    clientIds: ["h1", "h2"],
    repoDigests: [],
    updateStatus: "none",
    updateChecks: [],
    instances: [
        { clientId: "h1", containerId: "c1", state: "running", clientOnline: true },
        { clientId: "h2", containerId: "c2", state: "exited", clientOnline: false },
    ],
    aggregateState: "running",
    autoUpdate: NOT_ENROLLED,
    hasConflict: false,
    ...over,
});

describe("containerStatus", () => {
    it("counts a running container's uptime from its start", () => {
        expect(containerStatus(container({ startedAt: hoursAgo(4) }), NOW)).toBe("Up 4 hours");
    });

    it("keeps counting between two state pushes", () => {
        const c = container({ startedAt: hoursAgo(4) });
        expect(containerStatus(c, NOW + 20 * 3600_000)).toBe("Up 24 hours");
    });

    it("adds the health of a running container", () => {
        const started = { startedAt: hoursAgo(4) };
        expect(containerStatus(container({ ...started, health: "healthy" }), NOW)).toBe("Up 4 hours (healthy)");
        expect(containerStatus(container({ ...started, health: "unhealthy" }), NOW)).toBe("Up 4 hours (unhealthy)");
        expect(containerStatus(container({ ...started, health: "starting" }), NOW)).toBe(
            "Up 4 hours (health: starting)",
        );
        expect(containerStatus(container({ ...started, health: "none" }), NOW)).toBe("Up 4 hours");
    });

    it("marks a paused container", () => {
        expect(containerStatus(container({ state: "paused", startedAt: hoursAgo(4) }), NOW)).toBe(
            "Up 4 hours (Paused)",
        );
    });

    it("says how a container exited, and how long ago", () => {
        const exited = container({ state: "exited", exitCode: 137, finishedAt: hoursAgo(3) });
        expect(containerStatus(exited, NOW)).toBe("Exited (137) 3 hours ago");
        expect(containerStatus(container({ state: "restarting", exitCode: 1, finishedAt: hoursAgo(3) }), NOW)).toBe(
            "Restarting (1) 3 hours ago",
        );
    });

    it("goes without a duration rather than showing a wrong one", () => {
        // A container that never started, or one the agent could not inspect.
        expect(containerStatus(container(), NOW)).toBe("Up");
        expect(containerStatus(container({ state: "exited", exitCode: 0 }), NOW)).toBe("Exited (0)");
        expect(containerStatus(container({ state: "exited" }), NOW)).toBe("Exited");
        expect(containerStatus(container({ startedAt: "not a date" }), NOW)).toBe("Up");
    });

    it("clamps a start in the future: the host's clock may be ahead of the browser's", () => {
        expect(containerStatus(container({ startedAt: hoursAgo(-1) }), NOW)).toBe("Up Less than a second");
    });

    it("names the states without a duration, and passes on one it does not know", () => {
        expect(containerStatus(container({ state: "created" }), NOW)).toBe("Created");
        expect(containerStatus(container({ state: "removing" }), NOW)).toBe("Removal In Progress");
        expect(containerStatus(container({ state: "dead" }), NOW)).toBe("Dead");
        expect(containerStatus(container({ state: "frozen" }), NOW)).toBe("frozen");
    });
});

describe("getNodeState", () => {
    it("is the aggregate of a group row", () => {
        expect(getNodeState(containerNode({ aggregateState: "mixed" }))).toBe("mixed");
    });

    it("is the container's own state on a connected host", () => {
        expect(getNodeState(clientNode({ containerState: "exited" }))).toBe("exited");
    });

    it("is unknown on an offline host, whatever its last snapshot said", () => {
        expect(getNodeState(clientNode({ containerState: "running", clientOnline: false }))).toBe("unknown");
    });

});

describe("stateDot", () => {
    it("gives a running container the dot of a connected client", () => {
        expect(stateDot("running")).toEqual({ tone: "success" });
    });

    it("tells the states of a container that is not running apart", () => {
        expect(stateDot("exited")).toEqual({ tone: "neutral" });
        expect(stateDot("paused")).toEqual({ tone: "warning" });
        expect(stateDot("dead")).toEqual({ tone: "error" });
        expect(stateDot("created")).toEqual({ tone: "accent" });
    });

    it("lets a restarting container pulse", () => {
        expect(stateDot("restarting")).toEqual({ tone: "info", pulse: true });
    });

    it("draws an offline host's container as unknown, which is not stopped", () => {
        expect(stateDot("unknown")).toEqual({ tone: "unknown" });
    });

    it("draws a state without an entry like a stopped container", () => {
        // The `stopped` and `mixed` of a group row, and whatever Docker adds.
        expect(stateDot("stopped")).toEqual({ tone: "neutral" });
        expect(stateDot("mixed")).toEqual({ tone: "neutral" });
        expect(stateDot("removing")).toEqual({ tone: "neutral" });
    });
});

describe("getInstances", () => {
    it("is every instance of a group row whose host is connected", () => {
        expect(getInstances(containerNode())).toEqual([
            { clientId: "h1", containerId: "c1", state: "running", clientOnline: true },
        ]);
    });

    it("is the one instance of a client row", () => {
        expect(getInstances(clientNode())).toEqual([
            { clientId: "h1", containerId: "c1", state: "running", clientOnline: true },
        ]);
    });

    it("is nothing for a client row whose host is offline", () => {
        expect(getInstances(clientNode({ clientOnline: false }))).toEqual([]);
    });
});

describe("containerPath", () => {
    it("opens the container's page for a group row", () => {
        expect(containerPath(containerNode({ id: "web" }))).toBe("/containers/web");
    });

    it("opens the instance by host and name, not by the Docker id a recreate replaces", () => {
        expect(containerPath(clientNode())).toBe("/containers/instances/h1/web");
    });

    it("encodes what a URL cannot carry", () => {
        expect(containerPath(containerNode({ id: "a/b c" }))).toBe("/containers/a%2Fb%20c");
        expect(containerPath(clientNode({ clientId: "h/1", containerName: "a b" }))).toBe(
            "/containers/instances/h%2F1/a%20b",
        );
    });
});

describe("action targets", () => {
    const ids = (instances: { containerId: string }[]) => instances.map((i) => i.containerId);
    const group = containerNode({
        instances: [
            { clientId: "h1", containerId: "running", state: "running", clientOnline: true },
            { clientId: "h2", containerId: "paused", state: "paused", clientOnline: true },
            { clientId: "h3", containerId: "exited", state: "exited", clientOnline: true },
            { clientId: "h4", containerId: "gone", state: "running", clientOnline: false },
        ],
    });

    it("starts what neither runs nor is paused", () => {
        expect(ids(startTargets(group))).toEqual(["exited"]);
    });

    it("stops what runs or is paused", () => {
        expect(ids(stopTargets(group))).toEqual(["running", "paused"]);
    });

    it("restarts only what runs", () => {
        expect(ids(restartTargets(group))).toEqual(["running"]);
    });

    it("has no target on a host that is not connected", () => {
        const row = clientNode({ clientOnline: false });
        expect([startTargets(row), stopTargets(row), restartTargets(row)]).toEqual([[], [], []]);
    });

    it("takes a client row as its one instance", () => {
        expect(ids(restartTargets(clientNode()))).toEqual(["c1"]);
        expect(restartTargets(clientNode({ containerState: "exited" }))).toEqual([]);
    });
});

describe("stateBadge", () => {
    it("names the states of one container", () => {
        expect(stateBadge("running")).toEqual({ label: "Running", variant: "success" });
        expect(stateBadge("paused")).toEqual({ label: "Paused", variant: "warning" });
        expect(stateBadge("restarting")).toEqual({ label: "Restarting", variant: "warning" });
        expect(stateBadge("dead")).toEqual({ label: "Dead", variant: "error" });
    });

    it("names a group whose instances disagree", () => {
        expect(stateBadge("mixed")).toEqual({ label: "Mixed", variant: "warning" });
    });

    it("keeps an offline host's container unknown, which is not stopped", () => {
        expect(stateBadge("unknown")).toEqual({ label: "Unknown", variant: "neutral" });
    });

    it("reads a state without an entry as stopped", () => {
        const stopped = { label: "Stopped", variant: "neutral" };
        expect(stateBadge("stopped")).toEqual(stopped);
        expect(stateBadge("exited")).toEqual(stopped);
        expect(stateBadge("created")).toEqual(stopped);
        expect(stateBadge("removing")).toEqual(stopped);
    });
});
