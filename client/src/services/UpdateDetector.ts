import {
    containerNameOf,
    localDigestOf,
    type ContainerUpdate,
    type DockerContainer,
    type DockerImage,
    type UpdateTrigger,
} from "@dim/shared";

/**
 * Which container ran which image, as the agent last saw it -- and from that, which container
 * now runs a different one. Pure: `UpdateHistoryService` reads the state, keeps the memory on
 * disk and sends what this finds; nothing in here touches Docker, the disk or the clock.
 *
 * An update is read off two states, not off the Docker events: a container of the same name
 * that runs another image than before. That is what makes an update seen whoever caused it --
 * this agent, `docker compose up`, another tool -- and while the agent was not running.
 */

/** How long a container that went away is remembered, for one that comes back on a new image. */
export const GONE_KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * How long a recreate this agent announced waits for the state that shows it. The state is
 * read within seconds of a recreate; the hour is for a self-update, whose new agent has to
 * start, and for an announcement whose recreate never happened.
 */
export const EXPECTATION_KEEP_MS = 60 * 60 * 1000;

const VERSION_LABEL = "org.opencontainers.image.version";

/** A recreate this agent is about to carry out, so the update it causes is credited to it. */
export interface Expectation {
    trigger: Exclude<UpdateTrigger, "external">;
    correlationId: string | null;
    /** ISO 8601. */
    at: string;
}

/** What is remembered of one container, by its name. */
export interface RememberedContainer {
    containerId: string;
    imageId: string;
    imageRef: string;
    digest: string | null;
    version: string | null;
    /** Since when no container of this name has existed; ISO 8601. */
    goneSince?: string;
    expected?: Expectation;
}

export type ImageMemory = Record<string, RememberedContainer>;

/** One update, as far as the two states tell it. The service gives it its id. */
export interface DetectedUpdate {
    occurredAt: string;
    containerName: string;
    containerId: string;
    imageRef: string;
    fromImageRef: string | null;
    fromImageId: string;
    toImageId: string;
    fromDigest: string | null;
    toDigest: string | null;
    fromVersion: string | null;
    toVersion: string | null;
    trigger: UpdateTrigger;
    correlationId: string | null;
}

export type ObservedImage = Pick<DockerImage, "id" | "repoDigests" | "labels">;

/**
 * The tag a container runs. The configured reference where it is one; a container created
 * from a bare image id is named by what `docker ps` shows for it instead.
 */
export function imageRefOf(container: Pick<DockerContainer, "image" | "configImage">): string {
    const configured = container.configImage;
    return configured && !configured.startsWith("sha256:") ? configured : container.image;
}

/** What is to be remembered of a container in this state. */
export function rememberedOf(container: DockerContainer, images: readonly ObservedImage[]): RememberedContainer {
    const imageRef = imageRefOf(container);
    const image = images.find((i) => i.id === container.imageId);
    return {
        containerId: container.id,
        imageId: container.imageId,
        imageRef,
        digest: image ? localDigestOf(imageRef, image.repoDigests) : null,
        version: image?.labels?.[VERSION_LABEL] || null,
    };
}

/** An image named by its id rather than a tag: `sha256:…`, as Docker names one without a tag. */
const isBareId = (ref: string): boolean => /^sha256:/.test(ref);

function isOlderThan(iso: string, keepMs: number, now: number): boolean {
    const at = Date.parse(iso);
    return Number.isNaN(at) || now - at > keepMs;
}

/** An announcement that has not expired, or none. */
function activeExpectation(entry: RememberedContainer, now: number): Expectation | undefined {
    return entry.expected && !isOlderThan(entry.expected.at, EXPECTATION_KEEP_MS, now) ? entry.expected : undefined;
}

/**
 * Compares a state with the memory and returns the updates it shows and the memory to keep.
 *
 * - A name never seen is remembered, and is no update: neither a new container nor the
 *   first state an agent reads.
 * - The same name on the same image is no update, whether or not it was recreated.
 * - The same name on another image is one. Its time is when the new container was created,
 *   which is right also for an update that happened while the agent was not running.
 * - A name that went away is kept for `GONE_KEEP_MS`, so a container removed and run again
 *   on a newer image -- `docker compose down`, `pull`, `up` -- is an update too.
 *
 * An update this agent announced (`expected`) is credited to the operation that announced
 * it; any other is `external`. A container recreated without changing its image uses up the
 * announcement.
 */
export function detectUpdates(
    previous: ImageMemory,
    containers: readonly DockerContainer[],
    images: readonly ObservedImage[],
    now: number,
): { updates: DetectedUpdate[]; next: ImageMemory } {
    const updates: DetectedUpdate[] = [];
    const next: ImageMemory = {};

    for (const container of containers) {
        const name = containerNameOf(container);
        const before = previous[name];
        const read = rememberedOf(container, images);
        // A container read while it is being removed has lost its configuration, and Docker
        // then names its image by id: that is no new tag, and must not replace the known one.
        const current = isBareId(read.imageRef) && before && !isBareId(before.imageRef)
            ? { ...read, imageRef: before.imageRef }
            : read;
        const expected = before ? activeExpectation(before, now) : undefined;

        if (!before) {
            next[name] = current;
            continue;
        }

        if (before.imageId === container.imageId) {
            // The announcement waits for the container to be recreated; a new id is that.
            const keep = expected && before.containerId === container.id ? expected : undefined;
            next[name] = keep ? { ...current, expected: keep } : current;
            continue;
        }

        updates.push({
            occurredAt: new Date(container.created * 1000).toISOString(),
            containerName: name,
            containerId: container.id,
            imageRef: current.imageRef,
            fromImageRef:
                before.imageRef !== current.imageRef && !isBareId(before.imageRef) && !isBareId(current.imageRef)
                    ? before.imageRef
                    : null,
            fromImageId: before.imageId,
            toImageId: current.imageId,
            fromDigest: before.digest,
            toDigest: current.digest,
            fromVersion: before.version,
            toVersion: current.version,
            trigger: expected?.trigger ?? "external",
            correlationId: expected?.correlationId ?? null,
        });
        next[name] = current;
    }

    for (const [name, entry] of Object.entries(previous)) {
        if (name in next) continue;
        if (!entry.goneSince) {
            next[name] = { ...entry, goneSince: new Date(now).toISOString() };
        } else if (!isOlderThan(entry.goneSince, GONE_KEEP_MS, now)) {
            next[name] = entry;
        }
    }

    return { updates, next };
}

/** The operation an update is credited to: an auto-update run or an action from the dashboard. */
export interface UpdateCause {
    id: string | null;
    trigger: Exclude<UpdateTrigger, "external">;
}

/** An update this agent carried out and that failed, as `UpdateHistoryService.reportFailure` takes it. */
export interface FailureInput {
    containerName: string;
    containerId?: string | null;
    imageRef: string;
    error: string;
    /** Left out: the operation that announced the recreate, as the memory has it. */
    cause?: UpdateCause | null;
    /**
     * Keeps the announcement, for a failed self-update: the new agent may already have seen
     * its own container on the new image, and the change back is then the same operation's.
     */
    keepAnnouncement?: boolean;
}

/**
 * The record of a failed update. What the container ran comes from the memory, since the
 * state shows nothing of an update that did not happen; there is no new image to name.
 */
export function failedUpdate(memory: ImageMemory, input: FailureInput, at: string): Omit<ContainerUpdate, "id"> {
    const before = memory[input.containerName];
    const announced = before?.expected;
    const cause =
        input.cause !== undefined
            ? input.cause
            : announced
              ? { id: announced.correlationId, trigger: announced.trigger }
              : null;
    return {
        occurredAt: at,
        containerName: input.containerName,
        containerId: input.containerId ?? before?.containerId ?? null,
        imageRef: input.imageRef,
        fromImageRef: before && before.imageRef !== input.imageRef ? before.imageRef : null,
        fromImageId: before?.imageId ?? null,
        toImageId: null,
        fromDigest: before?.digest ?? null,
        toDigest: null,
        fromVersion: before?.version ?? null,
        toVersion: null,
        // A failure is always this agent's own doing; without a known cause it was asked for.
        trigger: cause?.trigger ?? "manual",
        result: "failed",
        error: input.error,
        correlationId: cause?.id ?? null,
    };
}

/** Records an announcement on the container's entry. A name not remembered is left alone. */
export function withExpectation(memory: ImageMemory, name: string, expected: Expectation): ImageMemory {
    const entry = memory[name];
    return entry ? { ...memory, [name]: { ...entry, expected } } : memory;
}

/** Drops the announcement on the container's entry, for a recreate that failed. */
export function withoutExpectation(memory: ImageMemory, name: string): ImageMemory {
    const entry = memory[name];
    if (!entry?.expected) return memory;
    const rest = { ...entry };
    delete rest.expected;
    return { ...memory, [name]: rest };
}

const isString = (value: unknown): value is string => typeof value === "string";
const optionalString = (value: unknown): string | null => (isString(value) && value.length > 0 ? value : null);

function parseExpectation(value: unknown): Expectation | undefined {
    const v = value as Partial<Record<keyof Expectation, unknown>> | null;
    if (!v || (v.trigger !== "auto" && v.trigger !== "manual") || !isString(v.at)) return undefined;
    return { trigger: v.trigger, correlationId: optionalString(v.correlationId), at: v.at };
}

/**
 * Reads the memory from its file. An entry that does not hold what an entry needs is left out:
 * the container is then seen as new, which costs one update at most, never a wrong one.
 */
export function parseMemory(value: unknown): ImageMemory {
    const memory: ImageMemory = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return memory;
    for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
        const v = raw as Partial<Record<keyof RememberedContainer, unknown>> | null;
        if (!v || !isString(v.containerId) || !isString(v.imageId) || !isString(v.imageRef)) continue;
        const entry: RememberedContainer = {
            containerId: v.containerId,
            imageId: v.imageId,
            imageRef: v.imageRef,
            digest: optionalString(v.digest),
            version: optionalString(v.version),
        };
        if (isString(v.goneSince)) entry.goneSince = v.goneSince;
        const expected = parseExpectation(v.expected);
        if (expected) entry.expected = expected;
        memory[name] = entry;
    }
    return memory;
}
