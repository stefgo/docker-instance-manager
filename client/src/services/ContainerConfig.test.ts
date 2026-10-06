import { describe, expect, it } from "vitest";
import type Dockerode from "dockerode";
import { buildCreateOptions } from "./ContainerConfig.js";

const ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const inspect = (
    config: Record<string, unknown> = {},
    networkMode = "bridge",
    networks: Record<string, unknown> = { bridge: {} },
): Dockerode.ContainerInspectInfo =>
    ({
        Id: ID,
        Name: "/web",
        Config: { Image: "nginx:1.27", Hostname: ID.slice(0, 12), ...config },
        HostConfig: { NetworkMode: networkMode },
        NetworkSettings: { Networks: networks },
    }) as unknown as Dockerode.ContainerInspectInfo;

describe("buildCreateOptions", () => {
    it("carries a hostname somebody set, but not the one Docker derived from the id", () => {
        expect(buildCreateOptions(inspect(), "nginx:1.28", null).Hostname).toBeUndefined();
        expect(buildCreateOptions(inspect({ Hostname: "web" }), "nginx:1.28", null).Hostname).toBe("web");
    });

    it("carries exposed ports and networks", () => {
        const options = buildCreateOptions(inspect({ ExposedPorts: { "80/tcp": {} } }), "nginx:1.28", null);
        expect(options.ExposedPorts).toEqual({ "80/tcp": {} });
        expect(options.NetworkingConfig).toEqual({ EndpointsConfig: { bridge: {} } });
    });

    it("leaves hostname and exposed ports out for a container in another one's network", () => {
        const info = inspect(
            { Hostname: "fedcba987654", ExposedPorts: { "3000/tcp": {} } },
            "container:fedcba9876543210",
            {},
        );
        const options = buildCreateOptions(info, "ghcr.io/tale/headplane:latest", null);
        expect(options.Hostname).toBeUndefined();
        expect(options.ExposedPorts).toBeUndefined();
        expect(options.NetworkingConfig).toBeUndefined();
        expect(options.HostConfig?.NetworkMode).toBe("container:fedcba9876543210");
    });
});
