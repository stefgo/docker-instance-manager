import Dockerode from "dockerode";
import fs from "fs";
import {
    DockerContainer,
    DockerImage,
    DockerVolume,
    DockerNetwork,
    DockerState,
    DockerAction,
    ImagePlatform,
    DockerActionResult,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { config } from "../core/Config.js";
import { isOwnContainer, spawnHelperContainer } from "./SelfUpdateService.js";
import { buildCreateOptions, imageConfigOf } from "./ContainerConfig.js";
import { ActivityService, CorrelationScope } from "./ActivityService.js";
import { mapDockerEvent } from "./DockerEventMapper.js";

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

/** The id `ref` resolves to on this host, or null while it has no such image. */
async function localImageId(docker: Dockerode, ref: string): Promise<string | null> {
    try {
        return (await docker.getImage(ref).inspect()).Id;
    } catch {
        return null;
    }
}

/** Whether an `image:update` recreates containers already on the new image too. */
function forceOf(params: Record<string, unknown> | undefined): boolean {
    return params?.force === true;
}

/**
 * The containers an `image:update` is limited to, from its `params`. Anything but a list of
 * ids is no limit: the action then covers every container on the image, as it always has.
 */
function containerIdsOf(params: Record<string, unknown> | undefined): string[] | undefined {
    const ids = params?.containerIds;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.length > 0)) return undefined;
    return ids as string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const RELEVANT_DOCKER_ACTIONS = {
    container: new Set(["create", "start", "restart", "stop", "die", "destroy", "kill", "oom", "pause", "unpause", "rename", "update", "health_status"]),
    image:     new Set(["pull", "tag", "untag", "delete", "import", "load"]),
    volume:    new Set(["create", "destroy"]),
    network:   new Set(["create", "destroy", "connect", "disconnect", "remove"]),
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** A timestamp from `State`, or undefined for Docker's "never" (`0001-01-01T00:00:00Z`). */
function dockerTime(value: string | undefined): string | undefined {
    return value && !value.startsWith("0001-") ? value : undefined;
}

async function mapContainer(c: Dockerode.ContainerInfo, docker: Dockerode): Promise<DockerContainer> {
    let configImage: string | undefined;
    let health: DockerContainer["health"];
    let startedAt: string | undefined;
    let finishedAt: string | undefined;
    let exitCode: number | undefined;
    try {
        const info = await docker.getContainer(c.Id).inspect();
        configImage = info.Config.Image;
        startedAt = dockerTime(info.State.StartedAt);
        finishedAt = dockerTime(info.State.FinishedAt);
        exitCode = info.State.ExitCode;
        // Health is only present on containers with a HEALTHCHECK, and dockerode's
        // State type does not carry it.
        const rawHealth = (info.State as { Health?: { Status?: string } }).Health?.Status;
        if (rawHealth === "healthy" || rawHealth === "unhealthy" || rawHealth === "starting") {
            health = rawHealth;
        } else if (rawHealth !== undefined) {
            health = "none";
        }
    } catch { /* container may have been removed between list and inspect */ }

    return {
        id: c.Id,
        names: c.Names,
        image: c.Image,
        imageId: c.ImageID,
        command: c.Command,
        created: c.Created,
        state: c.State,
        health,
        startedAt,
        finishedAt,
        exitCode,
        ports: (c.Ports || []).map((p) => ({
            ip: p.IP,
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort,
            type: p.Type,
        })),
        labels: c.Labels || {},
        configImage,
    };
}

function mapImage(img: Dockerode.ImageInfo, platform: ImagePlatform | undefined): DockerImage {
    return {
        id: img.Id,
        parentId: img.ParentId,
        repoTags: img.RepoTags || [],
        repoDigests: img.RepoDigests || [],
        created: img.Created,
        size: img.Size,
        labels: img.Labels || null,
        ...(platform ? { platform } : {}),
    };
}

/**
 * The platform of every local image, by image id. `listImages` does not report it, so
 * each image is inspected once; an id names the same content for good, so the answer
 * never goes stale and is dropped only when the image is gone. A failed inspect is not
 * remembered and is tried again with the next state.
 */
const imagePlatforms = new Map<string, ImagePlatform>();

async function resolveImagePlatforms(
    images: Dockerode.ImageInfo[],
    docker: Dockerode,
): Promise<Map<string, ImagePlatform>> {
    const present = new Set(images.map((img) => img.Id));
    for (const id of imagePlatforms.keys()) {
        if (!present.has(id)) imagePlatforms.delete(id);
    }
    await Promise.all(
        images
            .filter((img) => !imagePlatforms.has(img.Id))
            .map(async (img) => {
                try {
                    const info = await docker.getImage(img.Id).inspect();
                    if (info.Os && info.Architecture) {
                        imagePlatforms.set(img.Id, { os: info.Os, architecture: info.Architecture });
                    }
                } catch { /* image may have been removed between list and inspect */ }
            }),
    );
    return imagePlatforms;
}

function mapVolume(v: Dockerode.VolumeInspectInfo): DockerVolume {
    return {
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        createdAt: (v as { CreatedAt?: string }).CreatedAt || "",
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
            config: (n.IPAM?.Config || []).map((cfg: { Subnet?: string; Gateway?: string }) => ({
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

        const platforms = await resolveImagePlatforms(images, docker);
        return {
            containers: await Promise.all(containers.map((c) => mapContainer(c, docker))),
            images: images.map((img) => mapImage(img, platforms.get(img.Id))),
            volumes: (volumesResp.Volumes || []).map(mapVolume),
            networks: (networks as Dockerode.NetworkInspectInfo[]).map(mapNetwork),
        };
    }

    /**
     * Starts watching Docker events. Every relevant one pushes a fresh state, and the ones
     * that stand for something worth reporting also become an activity event.
     *
     * The event's *content* used to be dropped here -- the watcher looked only at whether
     * the action was relevant and then sent a snapshot. Reading it is what makes an exit
     * code, an OOM kill or a health transition reportable at all: none of them survives the
     * comparison of two snapshots the server used to do in its place.
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
                    // health_status carries its state in the action ("health_status: healthy"),
                    // so the set is checked against the first word.
                    const action = String(event.Action ?? "").split(":")[0].trim();
                    if (!RELEVANT_DOCKER_ACTIONS[event.Type as keyof typeof RELEVANT_DOCKER_ACTIONS]?.has(action)) return;
                    logger.debug({ event: event.Type, action: event.Action }, "Docker event");

                    const activity = mapDockerEvent(event);
                    if (activity) ActivityService.report(activity);

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
        } catch {
            logger.warn(
                { socket: resolveSocket() },
                "Docker daemon not reachable – retrying in 15s. " +
                "Set 'dockerSocket' in config.yaml to override the socket path.",
            );
            setTimeout(() => this.watch(callback), 15_000);
        }
    }

    /**
     * Pulls `target` and reports which image the tag pointed to before and after. Pulling is
     * all it does: which containers move to the new image is the caller's decision, because
     * a manual action and a scheduled run answer it differently.
     *
     * `scope` is told which containers this is about to touch, as soon as the list is
     * known -- here and in `updateContainer`. That is the whole of the correlation: the
     * events Docker sends back arrive at the watcher above and are stamped with the operation
     * that caused them, because the side doing the work said in advance what it was going to do.
     */
    static async updateImage(
        target: string,
        docker: Dockerode = createDockerode(),
        scope?: CorrelationScope,
    ): Promise<{ previousId: string | null; currentId: string | null }> {
        scope?.covers(target);
        const previousId = await localImageId(docker, target);
        logger.debug(`Pulling image ${target} (Id: ${previousId})`);
        await new Promise<void>((resolve, reject) => {
            docker.pull(target, (err: Error | null, stream: NodeJS.ReadableStream) => {
                if (err) return reject(err);
                docker.modem.followProgress(stream, (err2: Error | null) => {
                    if (err2) reject(err2); else resolve();
                });
            });
        });
        return { previousId, currentId: await localImageId(docker, target) };
    }

    /**
     * Recreates one container from its own configuration, on `image` or -- without one -- on
     * the reference it was configured with, which after a pull is the new image.
     *
     * The agent's own container is not recreated from inside itself: `spawnHelperContainer`
     * takes that over, and this process ends shortly after. A caller with more to do puts
     * this container last.
     */
    static async updateContainer(
        target: string,
        docker: Dockerode = createDockerode(),
        scope?: CorrelationScope,
        image?: string,
    ): Promise<void> {
        const container = docker.getContainer(target);
        const info = await container.inspect();
        const name = info.Name.replace(/^\//, "");
        const ref = image ?? info.Config.Image;
        scope?.covers(name, info.Id);

        if (isOwnContainer(info.Id)) {
            logger.info("Self-update detected: spawning helper container");
            await spawnHelperContainer(ref);
            return;
        }

        const options = buildCreateOptions(info, ref, await imageConfigOf(docker, info));
        const wasRunning = info.State.Running || info.State.Paused;
        scope?.expect(`container.removed:${info.Id}`);
        if (wasRunning) scope?.expect(`container.started:${name}`);

        logger.debug(`Recreating container ${info.Id} (${name}) with image ${ref}`);
        if (wasRunning) await container.stop().catch(() => {});
        await container.remove({ force: true });
        const created = await docker.createContainer(options);
        if (wasRunning) await created.start();
        logger.debug(`Container ${name} recreated as ${created.id}`);
    }

    /**
     * Pull & recreate, as the dashboard asks for it: pulls `target`, then recreates every
     * container configured with it that does not run the image the tag now points to --
     * limited to `containerIds` where the request names them. A container already on the
     * new image is left alone, which also makes a pull that brought nothing new a no-op --
     * unless `force` is set: then every container configured with it is recreated.
     *
     * Configured with the reference is read in two ways: the tag the container was created
     * from, or the image the tag pointed to before the pull, for a container whose
     * configuration names a bare `sha256:` id.
     */
    static async pullAndRecreate(
        target: string,
        docker: Dockerode = createDockerode(),
        scope?: CorrelationScope,
        containerIds?: string[],
        force = false,
    ): Promise<void> {
        const { previousId, currentId } = await this.updateImage(target, docker, scope);
        const { containers } = await this.getState();
        const wanted = containerIds ? new Set(containerIds) : null;

        const affected = containers.filter((c) => {
            if (wanted && !wanted.has(c.id)) return false;
            if (!force && currentId && c.imageId === currentId) return false;
            const ref = c.configImage ?? c.image;
            return ref === target || (previousId !== null && c.imageId === previousId);
        });
        // Its own container ends this process, so it goes last.
        affected.sort((a, b) => Number(isOwnContainer(a.id)) - Number(isOwnContainer(b.id)));

        logger.debug(`Recreating ${affected.length} containers using the updated image ${target}`);
        for (const c of affected) {
            const configured = c.configImage ?? c.image;
            await this.updateContainer(c.id, docker, scope, configured.startsWith("sha256:") ? target : undefined);
        }
    }

    /**
     * Executes a Docker action requested by the server and returns the result.
     *
     * The whole action runs inside a correlation scope keyed on the server's `actionId`.
     * Everything Docker reports because of it is stamped with that id on its way through
     * the watcher, so the dashboard groups the request with its consequences without
     * anybody matching names inside a time window.
     */
    static async executeAction(action: DockerAction): Promise<DockerActionResult> {
        const docker = createDockerode();
        const { actionId, action: type, target, params } = action;
        const scope = ActivityService.beginScope(actionId);
        scope.covers(target);
        try {
            switch (type) {
                case "container:start":
                    scope.expect(`container.started:${target}`);
                    await docker.getContainer(target).start();
                    break;
                case "container:stop":
                    scope.expect(`container.stopped:${target}`);
                    await docker.getContainer(target).stop();
                    break;
                case "container:restart":
                    scope.expect(`container.started:${target}`);
                    await docker.getContainer(target).restart();
                    break;
                case "container:remove":
                    scope.expect(`container.removed:${target}`);
                    await docker.getContainer(target).remove({ force: true });
                    break;
                case "container:pause":
                    await docker.getContainer(target).pause();
                    break;
                case "container:unpause":
                    await docker.getContainer(target).unpause();
                    break;
                case "container:recreate":
                    await this.updateContainer(target, docker, scope);
                    break;
                case "image:prune": {
                    const pruned = await docker.pruneImages({});
                    logger.info({ deleted: pruned.ImagesDeleted?.length ?? 0, spaceReclaimed: pruned.SpaceReclaimed }, "Image prune completed");
                    break;
                }
                case "image:remove":
                    scope.expect(`image.removed:${target}`);
                    await docker.getImage(target).remove({ force: params?.force === true });
                    break;
                case "image:pull":
                    scope.expect(`image.pulled:${target}`);
                    await this.updateImage(target, docker, scope);
                    break;
                case "image:update":
                    await this.pullAndRecreate(target, docker, scope, containerIdsOf(params), forceOf(params));
                    break;
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
        } catch (err) {
            logger.error({ err, action: type, target }, "Docker action failed");
            return {
                actionId,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        } finally {
            // Ends the scope on every path out. It then lives only for the events still on
            // their way, and closes as soon as it has seen the ones it was told to expect.
            ActivityService.endScope(scope);
        }
    }
}
