import Dockerode from "dockerode";
import fs from "fs";
import {
    DockerContainer,
    DockerImage,
    DockerVolume,
    DockerNetwork,
    DockerState,
    DockerAction,
    DockerActionResult,
} from "@docker-instance-manager/shared";
import { logger } from "../core/logger.js";
import { config } from "../core/Config.js";
import { isOwnContainer, spawnHelperContainer } from "./SelfUpdateService.js";

function resolveSocket(): string {
    if (config.dockerSocket) return config.dockerSocket;
    // Docker Desktop on macOS uses a user-scoped socket
    const macSocket = `${process.env.HOME}/.docker/run/docker.sock`;
    if (process.platform === "darwin" && fs.existsSync(macSocket)) {
        return macSocket;
    }
    return "/var/run/docker.sock";
}

export function createDockerode(): Dockerode {
    return new Dockerode({ socketPath: resolveSocket() });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapContainer(c: Dockerode.ContainerInfo): DockerContainer {
    return {
        id: c.Id,
        names: c.Names,
        image: c.Image,
        imageId: c.ImageID,
        command: c.Command,
        created: c.Created,
        state: c.State,
        status: c.Status,
        ports: (c.Ports || []).map((p) => ({
            ip: p.IP,
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort,
            type: p.Type,
        })),
        labels: c.Labels || {},
    };
}

function mapImage(img: Dockerode.ImageInfo): DockerImage {
    return {
        id: img.Id,
        parentId: img.ParentId,
        repoTags: img.RepoTags || [],
        repoDigests: img.RepoDigests || [],
        created: img.Created,
        size: img.Size,
        labels: img.Labels || null,
    };
}

function mapVolume(v: Dockerode.VolumeInspectInfo): DockerVolume {
    return {
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        createdAt: (v as any).CreatedAt || "",
        labels: v.Labels || null,
        scope: v.Scope,
    };
}

function mapNetwork(n: Dockerode.NetworkInspectInfo): DockerNetwork {
    return {
        id: n.Id || "",
        name: n.Name || "",
        driver: n.Driver || "",
        scope: n.Scope || "",
        ipam: {
            driver: n.IPAM?.Driver || "",
            config: (n.IPAM?.Config || []).map((cfg: any) => ({
                subnet: cfg.Subnet,
                gateway: cfg.Gateway,
            })),
        },
        internal: n.Internal || false,
        attachable: n.Attachable || false,
        labels: n.Labels || null,
        created: n.Created || "",
    };
}

// ── DockerService ───────────────────────────────────────────────────────────

export class DockerService {
    private static eventStream: NodeJS.ReadableStream | null = null;
    private static onUpdate: ((state: Omit<DockerState, "updatedAt">) => void) | null = null;

    /**
     * Fetches the complete Docker state (containers, images, volumes, networks).
     */
    static async getState(): Promise<Omit<DockerState, "updatedAt">> {
        const docker = createDockerode();
        const [containers, images, volumesResp, networks] = await Promise.all([
            docker.listContainers({ all: true }),
            docker.listImages({ all: false }),
            docker.listVolumes(),
            docker.listNetworks(),
        ]);

        return {
            containers: containers.map(mapContainer),
            images: images.map(mapImage),
            volumes: (volumesResp.Volumes || []).map(mapVolume),
            networks: (networks as Dockerode.NetworkInspectInfo[]).map(mapNetwork),
        };
    }

    /**
     * Starts watching Docker events and calls the callback on every relevant change.
     */
    static async watch(callback: (state: Omit<DockerState, "updatedAt">) => void) {
        this.onUpdate = callback;

        try {
            const docker = createDockerode();
            this.eventStream = await docker.getEvents({
                filters: { type: ["container", "image", "volume", "network"] },
            });

            this.eventStream.on("data", async (chunk: Buffer) => {
                try {
                    const event = JSON.parse(chunk.toString());
                    logger.debug({ event: event.Type, action: event.Action }, "Docker event");
                    const state = await this.getState();
                    callback(state);
                } catch (e) {
                    logger.error({ err: e }, "Docker event parse error");
                }
            });

            this.eventStream.on("error", (err: Error) => {
                logger.warn({ err }, "Docker event stream error – reconnecting in 10s");
                this.eventStream = null;
                setTimeout(() => this.watch(callback), 10_000);
            });

            this.eventStream.on("end", () => {
                logger.warn("Docker event stream ended – reconnecting in 10s");
                this.eventStream = null;
                setTimeout(() => this.watch(callback), 10_000);
            });

            logger.info(`Docker event watcher started (socket: ${resolveSocket()})`);
        } catch (err) {
            logger.warn(
                { socket: resolveSocket() },
                "Docker daemon not reachable – retrying in 15s. " +
                "Set 'dockerSocket' in config.yaml to override the socket path.",
            );
            setTimeout(() => this.watch(callback), 15_000);
        }
    }

    /**
     * Executes a Docker action requested by the server and returns the result.
     */
    static async executeAction(action: DockerAction): Promise<DockerActionResult> {
        const docker = createDockerode();
        const { actionId, action: type, target, params } = action;
        try {
            switch (type) {
                case "container:start":
                    await docker.getContainer(target).start();
                    break;
                case "container:stop":
                    await docker.getContainer(target).stop();
                    break;
                case "container:restart":
                    await docker.getContainer(target).restart();
                    break;
                case "container:remove":
                    await docker.getContainer(target).remove({ force: true });
                    break;
                case "container:pause":
                    await docker.getContainer(target).pause();
                    break;
                case "container:unpause":
                    await docker.getContainer(target).unpause();
                    break;
                case "container:recreate": {
                    const container = docker.getContainer(target);
                    const info = await container.inspect();
                    const wasRunning = info.State.Running || info.State.Paused;
                    if (wasRunning) await container.stop().catch(() => {});
                    await container.remove({ force: true });
                    const newContainer = await docker.createContainer({
                        name: info.Name.replace(/^\//, ""),
                        Image: info.Config.Image,
                        Env: info.Config.Env ?? undefined,
                        Cmd: info.Config.Cmd ?? undefined,
                        Labels: info.Config.Labels ?? undefined,
                        ExposedPorts: info.Config.ExposedPorts,
                        HostConfig: info.HostConfig,
                        NetworkingConfig: { EndpointsConfig: info.NetworkSettings.Networks },
                    } as any);
                    if (wasRunning) await newContainer.start();
                    break;
                }
                case "image:remove":
                    await docker.getImage(target).remove({ force: params?.force ?? false });
                    break;
                case "image:pull": {
                    await new Promise<void>((resolve, reject) => {
                        docker.pull(target, (err: Error | null, stream: NodeJS.ReadableStream) => {
                            if (err) return reject(err);
                            docker.modem.followProgress(stream, (err2: Error | null) => {
                                if (err2) reject(err2); else resolve();
                            });
                        });
                    });
                    break;
                }
                case "image:update": {
                    // 1. Pull new image
                    await new Promise<void>((resolve, reject) => {
                        docker.pull(target, (err: Error | null, stream: NodeJS.ReadableStream) => {
                            if (err) return reject(err);
                            docker.modem.followProgress(stream, (err2: Error | null) => {
                                if (err2) reject(err2); else resolve();
                            });
                        });
                    });
                    // 2. Find and recreate all containers using this image
                    const allContainers = await docker.listContainers({ all: true });
                    const affected = allContainers.filter(
                        (c) => c.Image === target || c.Image === target.split(":")[0],
                    );
                    for (const containerInfo of affected) {
                        if (isOwnContainer(containerInfo.Id)) {
                            logger.info("Self-update detected: spawning helper container");
                            await spawnHelperContainer(target);
                            continue;
                        }
                        const container = docker.getContainer(containerInfo.Id);
                        const info = await container.inspect();
                        const wasRunning = info.State.Running || info.State.Paused;
                        if (wasRunning) await container.stop().catch(() => {});
                        await container.remove({ force: true });
                        const newContainer = await docker.createContainer({
                            name: info.Name.replace(/^\//, ""),
                            Image: target,
                            Env: info.Config.Env ?? undefined,
                            Cmd: info.Config.Cmd ?? undefined,
                            Labels: info.Config.Labels ?? undefined,
                            ExposedPorts: info.Config.ExposedPorts,
                            HostConfig: info.HostConfig,
                            NetworkingConfig: { EndpointsConfig: info.NetworkSettings.Networks },
                        } as any);
                        if (wasRunning) await newContainer.start();
                    }
                    break;
                }
                case "volume:remove":
                    await docker.getVolume(target).remove();
                    break;
                case "network:remove":
                    await docker.getNetwork(target).remove();
                    break;
                default:
                    return { actionId, success: false, error: `Unknown action: ${type}` };
            }
            return { actionId, success: true };
        } catch (err: any) {
            logger.error({ err, action: type, target }, "Docker action failed");
            return { actionId, success: false, error: err?.message || String(err) };
        }
    }
}
