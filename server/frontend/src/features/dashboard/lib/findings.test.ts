import { describe, expect, it } from "vitest";
import type { Client, ContainerUpdateRecord, DockerContainer, DockerState, RegistryStatus } from "@dim/shared";
import type { ContainerAssignment } from "../../projects/lib/projectMembers";
import { buildFindings, findingAge, findingSummary, fleetStatus, type FindingsInput } from "./findings";

const NOW = Date.parse("2026-10-25T12:00:00.000Z");

const client = (over: Partial<Client> = {}): Client =>
    ({
        id: "c1",
        hostname: "web01",
        displayName: null,
        status: "online",
        connectionMode: "inbound",
        lastSeen: "2026-10-25T11:59:00.000Z",
        capabilities: ["auto-update", "project-query", "update-history"],
        docker: { reachable: true, error: null, since: "2026-10-20T00:00:00.000Z" },
        ...over,
    }) as Client;

const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "k1",
    names: ["/app"],
    image: "app:1",
    imageId: "sha256:a",
    command: "run",
    created: 1,
    state: "running",
    ports: [],
    labels: {},
    ...over,
});

const state = (...containers: DockerContainer[]): DockerState => ({
    containers,
    images: [],
    volumes: [],
    networks: [],
    updatedAt: "2026-10-25T11:59:00.000Z",
});

const update = (over: Partial<ContainerUpdateRecord> = {}): ContainerUpdateRecord => ({
    id: "u1",
    clientId: "c1",
    occurredAt: "2026-10-25T03:00:00.000Z",
    receivedAt: "2026-10-25T03:00:01.000Z",
    containerName: "app",
    imageRef: "app:1",
    trigger: "auto",
    result: "failed",
    error: "pull access denied",
    projectIds: [],
    ...over,
});

function findings(over: Partial<FindingsInput> = {}) {
    return buildFindings({
        clients: [client()],
        dockerStates: { c1: state(container()) },
        assignment: new Map(),
        updates: [],
        registries: [],
        now: NOW,
        ...over,
    });
}

const texts = (over: Partial<FindingsInput> = {}) => findings(over).map((f) => f.text);

describe("a healthy fleet", () => {
    it("has nothing to say", () => {
        expect(findings()).toEqual([]);
        expect(fleetStatus([], [client()])).toBe("healthy");
    });
});

describe("the clients", () => {
    it("names one that is offline, since it was last seen", () => {
        const [offline] = findings({ clients: [client({ status: "offline" })] });
        expect(offline).toMatchObject({
            type: "client-offline",
            severity: "error",
            text: "web01 is offline",
            to: "/clients/c1",
            since: "2026-10-25T11:59:00.000Z",
        });
    });

    it("leaves out one that still awaits its agent", () => {
        expect(findings({ clients: [client({ status: "offline", lastSeen: null })] })).toEqual([]);
    });

    it("names an outbound client that never connected", () => {
        const never = client({ status: "offline", lastSeen: null, connectionMode: "outbound" });
        expect(texts({ clients: [never] })).toEqual(["web01 has never connected"]);
    });

    // What the agent last read of Docker is not its present: its containers are not judged.
    it("names one whose agent cannot reach Docker, and judges none of its containers", () => {
        const blind = client({ docker: { reachable: false, error: "socket not found", since: "2026-10-25T10:00:00.000Z" } });
        expect(texts({ clients: [blind], dockerStates: { c1: state(container({ state: "dead" })) } })).toEqual([
            "web01 cannot reach Docker: socket not found",
        ]);
    });

    it("judges no container of a host that is offline", () => {
        const offline = client({ status: "offline" });
        expect(texts({ clients: [offline], dockerStates: { c1: state(container({ state: "dead" })) } })).toEqual([
            "web01 is offline",
        ]);
    });

    it("names an agent that does not report container updates", () => {
        const old = client({ capabilities: ["auto-update"], version: "1.7.0" });
        expect(findings({ clients: [old] })).toMatchObject([
            { type: "agent-outdated", severity: "warning", text: "The agent on web01 (1.7.0) does not report container updates" },
        ]);
    });
});

describe("the containers", () => {
    const one = (over: Partial<DockerContainer>) => findings({ dockerStates: { c1: state(container(over)) } });

    it("names one that is unhealthy, restarting or dead, as errors", () => {
        expect(one({ health: "unhealthy" })[0]).toMatchObject({
            severity: "error",
            text: "app on web01 is unhealthy",
            to: "/containers/instances/c1/app",
        });
        expect(one({ state: "restarting", exitCode: 1 })[0].text).toBe("app on web01 keeps restarting (exit code 1)");
        expect(one({ state: "dead" })[0].text).toBe("app on web01 is dead");
    });

    it("names one that ended by itself, as a warning since it ended", () => {
        expect(one({ state: "exited", exitCode: 1, finishedAt: "2026-10-25T09:00:00.000Z" })[0]).toMatchObject({
            severity: "warning",
            text: "app on web01 exited with code 1",
            since: "2026-10-25T09:00:00.000Z",
        });
    });

    // A `docker stop` ends a container with SIGTERM, and most of them then exit with 0 or 143.
    it("leaves out one that was stopped", () => {
        expect(one({ state: "exited", exitCode: 0 })).toEqual([]);
        expect(one({ state: "exited", exitCode: 143 })).toEqual([]);
        expect(one({ state: "created" })).toEqual([]);
    });

    it("names one that matches several projects", () => {
        const assignment = new Map<string, ContainerAssignment>([
            ["c1/k1", { kind: "conflict", projects: [{ id: "p1" }, { id: "p2" }] } as ContainerAssignment],
        ]);
        expect(texts({ assignment })).toEqual(["app on web01 matches 2 projects and is auto-updated by none of them"]);
    });
});

describe("the updates", () => {
    it("names a container whose last update failed", () => {
        expect(findings({ updates: [update()] })[0]).toMatchObject({
            type: "update-failed",
            severity: "error",
            text: "Update of app on web01 failed: pull access denied",
            since: "2026-10-25T03:00:00.000Z",
        });
    });

    it("forgets it once a later update went through", () => {
        const later = update({ id: "u2", result: "updated", error: null, occurredAt: "2026-10-25T04:00:00.000Z" });
        expect(findings({ updates: [later, update()] })).toEqual([]);
    });

    it("forgets it once the container is gone", () => {
        expect(findings({ updates: [update()], dockerStates: { c1: state() } })).toEqual([]);
    });
});

describe("the registries", () => {
    const registry = (pausedUntil: string | null): RegistryStatus => ({
        registry: "registry-1.docker.io",
        targets: 3,
        checked: 1,
        lastCheckedAt: null,
        pausedUntil,
        remaining: 0,
        error: null,
    });

    it("names one paused by a rate limit, until it is asked again", () => {
        const [paused] = findings({ registries: [registry("2026-10-25T14:00:00.000Z")] });
        expect(paused).toMatchObject({ type: "registry-paused", severity: "warning", until: "2026-10-25T14:00:00.000Z" });
    });

    it("leaves out a pause that is over", () => {
        expect(findings({ registries: [registry("2026-10-25T11:00:00.000Z"), registry(null)] })).toEqual([]);
    });
});

describe("the order and the status", () => {
    it("puts the hosts before the containers within a severity", () => {
        const all = findings({
            clients: [client(), client({ id: "c2", hostname: "alpha", status: "offline" })],
            dockerStates: { c1: state(container({ names: ["/aaa"], state: "dead" })) },
        });
        expect(all.map((f) => f.type)).toEqual(["client-offline", "container-dead"]);
    });

    it("puts errors first", () => {
        const all = findings({
            clients: [client({ capabilities: [] }), client({ id: "c2", hostname: "db01", status: "offline" })],
        });
        expect(all.map((f) => f.severity)).toEqual(["error", "warning"]);
    });

    it("is critical with an error, degraded with warnings only, unknown with no client", () => {
        const error = findings({ clients: [client({ status: "offline" })] });
        const warning = findings({ clients: [client({ capabilities: [] })] });
        expect(fleetStatus(error, [client()])).toBe("critical");
        expect(fleetStatus(warning, [client()])).toBe("degraded");
        expect(fleetStatus([], [])).toBe("unknown");
        expect(fleetStatus([], [client({ status: "offline", lastSeen: null })])).toBe("unknown");
    });

    it("counts the findings, or says what the status means", () => {
        expect(findingSummary(findings({ clients: [client({ status: "offline" })] }), "critical")).toBe("1 finding");
        expect(findingSummary([], "healthy")).toBe("Nothing needs attention.");
    });

    it("says how long a finding has lasted, where that is known", () => {
        expect(findingAge({ since: "2026-10-22T12:00:00.000Z" }, NOW)).toBe("For 3 days");
        expect(findingAge({ since: null }, NOW)).toBeNull();
    });
});
