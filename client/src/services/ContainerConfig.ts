import Dockerode from "dockerode";

/** `Config` of a container or an image, read loosely: dockerode's types miss half of it. */
type ConfigShape = Record<string, unknown>;

/**
 * Settings a container carries that its image may have supplied. Each is compared with the
 * old image and kept only where it differs -- see `buildCreateOptions`.
 */
const IMAGE_DEFAULTS = ["User", "WorkingDir", "Entrypoint", "Cmd", "Healthcheck", "StopSignal"] as const;

/** Settings only a container has, copied as they are. */
const CONTAINER_ONLY = ["Domainname", "Tty", "OpenStdin", "StdinOnce", "StopTimeout"] as const;

/** Empty and absent are the same setting; `inspect` reports them either way. */
function normalized(value: unknown): unknown {
    if (value === undefined || value === null || value === "") return null;
    if (Array.isArray(value) && value.length === 0) return null;
    return value;
}

function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}

/**
 * The configuration a container is created from again, on `image`.
 *
 * `inspect` reports a container's configuration merged with the defaults of the image it was
 * created from, and nothing marks which is which. Copied whole, those defaults would outlive
 * the image they came from: a release that changes its entrypoint, its working directory or
 * an environment default would be recreated with the old one. So whatever the old image
 * already had is left out and the new image supplies its own; what differs is what somebody
 * set, and that is kept. Without the old image to compare against, everything is copied.
 *
 * A carried entrypoint takes its command along even where that equals the image's: Docker
 * drops the image's command as soon as an entrypoint is given, so leaving it out would run
 * the entrypoint without one.
 */
export function buildCreateOptions(
    info: Dockerode.ContainerInspectInfo,
    image: string,
    imageConfig: ConfigShape | null,
): Dockerode.ContainerCreateOptions {
    const config = info.Config as unknown as ConfigShape;
    const options: ConfigShape = {
        name: info.Name.replace(/^\//, ""),
        Image: image,
    };

    const inherited = (key: string): boolean => imageConfig !== null && sameValue(config[key], imageConfig[key]);
    for (const key of IMAGE_DEFAULTS) {
        if (normalized(config[key]) !== null && !inherited(key)) options[key] = config[key];
    }
    if ("Entrypoint" in options && config.Cmd != null) options.Cmd = config.Cmd;

    for (const key of CONTAINER_ONLY) {
        if (config[key] !== undefined && config[key] !== null) options[key] = config[key];
    }

    // Docker names a container's host after its own id unless told otherwise. Carried over,
    // the old id would become a fixed hostname -- and the agent finds its own container by
    // exactly that value.
    const hostname = typeof config.Hostname === "string" ? config.Hostname : "";
    if (hostname && !info.Id.startsWith(hostname)) options.Hostname = hostname;

    const imageEnv = new Set(Array.isArray(imageConfig?.Env) ? (imageConfig.Env as string[]) : []);
    const env = (info.Config.Env ?? []).filter((entry) => !imageEnv.has(entry));
    if (env.length > 0) options.Env = env;

    const imageLabels = (imageConfig?.Labels ?? {}) as Record<string, string>;
    const labels = Object.fromEntries(
        Object.entries(info.Config.Labels ?? {}).filter(([key, value]) => imageLabels[key] !== value),
    );
    if (Object.keys(labels).length > 0) options.Labels = labels;

    if (info.Config.ExposedPorts) options.ExposedPorts = info.Config.ExposedPorts;
    options.HostConfig = info.HostConfig;

    // API ≥ v1.44: all networks can be passed at once in NetworkingConfig.
    const networks = info.NetworkSettings.Networks ?? {};
    if (Object.keys(networks).length > 0) options.NetworkingConfig = { EndpointsConfig: networks };

    return options as Dockerode.ContainerCreateOptions;
}

/** The configuration of the image a container was created from, or null once it is gone. */
export async function imageConfigOf(
    docker: Dockerode,
    info: Dockerode.ContainerInspectInfo,
): Promise<ConfigShape | null> {
    try {
        const image = await docker.getImage(info.Image).inspect();
        return (image.Config as unknown as ConfigShape) ?? null;
    } catch {
        return null;
    }
}
