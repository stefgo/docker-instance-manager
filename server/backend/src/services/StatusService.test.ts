import { StatusReportSchema, type Client, type DockerContainer } from "@dim/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.fn<() => Client[]>();
const states = vi.fn<() => { clientId: string; containers: DockerContainer[]; images: [] }[]>();

// Every one of these reaches the database or config.yaml when it is imported.
vi.mock("./ProxyService.js", () => ({ ProxyService: { getClientsWithStatus: () => clients() } }));
vi.mock("../repositories/DockerStateRepository.js", () => ({ DockerStateRepository: { getAllClientStates: () => states() } }));
vi.mock("./ProjectService.js", () => ({ ProjectService: { hostStates: () => [], listWithMembers: () => [] } }));
vi.mock("./ContainerUpdateService.js", () => ({ ContainerUpdateService: { list: () => [] } }));
vi.mock("./ImageUpdateCheckSchedulerService.js", () => ({
    ImageUpdateCheckSchedulerService: { getStatus: () => ({ registries: [] }) },
}));

const { StatusService } = await import("./StatusService.js");

const NOW = Date.parse("2026-10-27T10:00:00.000Z");

const client = (id: string, over: Partial<Client> = {}): Client =>
    ({
        id,
        hostname: id,
        displayName: null,
        status: "online",
        connectionMode: "inbound",
        lastSeen: "2026-10-27T09:59:00.000Z",
        capabilities: ["update-history"],
        docker: { reachable: true, error: null, since: null },
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

beforeEach(() => {
    clients.mockReset().mockReturnValue([]);
    states.mockReset().mockReturnValue([]);
});

describe("StatusService.report", () => {
    it("is unknown without a registered client", () => {
        const report = StatusService.report(NOW);
        expect(StatusReportSchema.parse(report)).toEqual(report);
        expect(report).toMatchObject({ app: "dim", status: "unknown", findings: [], summary: { clients: { online: 0, total: 0 } } });
    });

    it("lists the overview's lines, errors first, with since where it is known", () => {
        clients.mockReturnValue([client("web01"), client("db01", { status: "offline", lastSeen: "2026-10-27T08:00:00.000Z" })]);
        states.mockReturnValue([
            { clientId: "web01", containers: [container({ state: "exited", exitCode: 1, finishedAt: "2026-10-27T09:00:00.000Z" })], images: [] },
        ]);

        const report = StatusService.report(NOW);

        expect(report.status).toBe("critical");
        expect(report.counts).toEqual({ error: 1, warning: 1 });
        expect(report.summary).toEqual({ clients: { online: 1, total: 2 } });
        expect(report.findings).toEqual([
            { id: "client-offline:db01", type: "client-offline", severity: "error", text: "db01 is offline", since: "2026-10-27T08:00:00.000Z" },
            {
                id: "container-exited:web01:app",
                type: "container-exited",
                severity: "warning",
                text: "app on web01 exited with code 1",
                since: "2026-10-27T09:00:00.000Z",
            },
        ]);
    });

    it("leaves out the Docker state of a client that is gone", () => {
        clients.mockReturnValue([client("web01")]);
        states.mockReturnValue([{ clientId: "deleted", containers: [container({ state: "dead" })], images: [] }]);

        expect(StatusService.report(NOW).status).toBe("healthy");
    });
});
