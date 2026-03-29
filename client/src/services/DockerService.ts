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
} from "@dim/shared";
import { logger } from "../core/logger.js";
import { config } from "../core/Config.js";
import { isOwnContainer, spawnHelperContainer } from "./SelfUpdateService.js";
import { log } from "console";

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

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Strips the tag from an image reference, correctly handling registry URLs with ports.
 *  e.g. "registry:5000/myimage:latest" → "registry:5000/myimage"
 *       "nginx:latest"                 → "nginx"
 *       "nginx"                        → "nginx"
 */
function stripImageTag(ref: string): string {
    const lastSlash = ref.lastIndexOf("/");
    const lastColon = ref.lastIndexOf(":");
    return lastColon > lastSlash ? ref.substring(0, lastColon) : ref;
}

// ── Constants ───────────────────────────────────────────────────────────────

const RELEVANT_DOCKER_ACTIONS = {
    container: new Set(["create", "start", "restart", "stop", "die", "destroy", "kill", "oom", "pause", "unpause", "rename", "update"]),
    image:     new Set(["pull", "tag", "untag", "delete", "import", "load"]),
    volume:    new Set(["create", "destroy"]),
    network:   new Set(["create", "destroy", "connect", "disconnect", "remove"]),
};

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
     * Checks that the Docker daemon exposes API v1.44 or newer.
     * Exits the process with code 1 if the requirement is not met.
     */
    static async assertMinApiVersion(): Promise<void> {
        const docker = createDockerode();
        const info = await docker.version();
        const apiVersion = info.ApiVersion ?? "0";
        const [major, minor] = apiVersion.split(".").map(Number);
        const supported = major > 1 || (major === 1 && minor >= 44);
        if (!supported) {
            logger.error(
                `Docker API version ${apiVersion} is not supported. ` +
                `Please upgrade Docker to Engine 25+ (API ≥ 1.44).`
            );
            process.exit(1);
        }
        logger.info(`Docker API version ${apiVersion} OK`);
    }

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
                    if (!RELEVANT_DOCKER_ACTIONS[event.Type as keyof typeof RELEVANT_DOCKER_ACTIONS]?.has(event.Action)) return;
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
                case "image:prune": {
                    const pruned = await docker.pruneImages({});
                    logger.info({ deleted: pruned.ImagesDeleted?.length ?? 0, spaceReclaimed: pruned.SpaceReclaimed }, "Image prune completed");
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
                    // Remember the current image ID before pulling so we can find
                    // containers by ImageID after the tag has moved to the new image.
                    let oldImageId: string | null = null;
                    try {
                        const imageInfo = await docker.getImage(target).inspect();
                        oldImageId = imageInfo.Id;
                    } catch {
                        // Image not present locally yet – fresh pull, no containers to recreate
                    }

                    // 1. Pull new image
                    logger.debug(`Updating image ${target} (Id: ${oldImageId}) and related containers`);
                    await new Promise<void>((resolve, reject) => {
                        docker.pull(target, (err: Error | null, stream: NodeJS.ReadableStream) => {
                            if (err) return reject(err);
                            docker.modem.followProgress(stream, (err2: Error | null) => {
                                if (err2) reject(err2); else resolve();
                            });
                        });
                    });
                    // 2. Find and recreate all containers using this image.
                    // Filter by ImageID (pre-pull ID) as primary key – the tag may have
                    // moved to the new image and c.Image could now show a sha256 reference.
                    // Fall back to name matching if the image was not present before the pull.
                    const allContainers = await docker.listContainers({ all: true });
                    const affected = allContainers.filter((c) =>
                        oldImageId
                            ? c.ImageID === oldImageId
                            : c.Image === target || c.Image === stripImageTag(target),
                    );
                    logger.debug(`Recreating ${affected.length} containers using the updated image ${target}`);
                    for (const containerInfo of affected) {
                        logger.debug(`Recreating container ${containerInfo.Id} (${containerInfo.Names.join(",")})`);
                        if (isOwnContainer(containerInfo.Id)) {
                            logger.info("Self-update detected: spawning helper container");
                            await spawnHelperContainer(target);
                            continue;
                        }
                        const container = docker.getContainer(containerInfo.Id);
                        const info = await container.inspect();
                        const wasRunning = info.State.Running || info.State.Paused;
                        logger.debug(`Container ${containerInfo.Id} was ${wasRunning ? "running" : "stopped/paused"}, stopping and removing...`);
                        if (wasRunning) await container.stop().catch(() => {});
                        logger.debug(`Removing container ${containerInfo.Id}...`);
                        await container.remove({ force: true });
                        // API ≥ v1.44: all networks can be passed at once in NetworkingConfig.
                        const allNetworks = info.NetworkSettings.Networks ?? {};

                        logger.debug(`Creating new container with image ${target}...`);
                        const newContainer = await docker.createContainer({
                            name: info.Name.replace(/^\//, ""),
                            Image: target,
                            Env: info.Config.Env ?? undefined,
                            Cmd: info.Config.Cmd ?? undefined,
                            Labels: info.Config.Labels ?? undefined,
                            ExposedPorts: info.Config.ExposedPorts,
                            HostConfig: info.HostConfig,
                            NetworkingConfig: Object.keys(allNetworks).length > 0
                                ? { EndpointsConfig: allNetworks }
                                : undefined,
                        } as any);

                        logger.debug(`Starting container ${newContainer.id}...`);
                        if (wasRunning) await newContainer.start();
                        logger.debug(`Container ${containerInfo.Id} recreated successfully with new image ${target}`);
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
