import { randomUUID } from "crypto";
import { ContainerUpdateSchema, type ContainerUpdate, type DockerState } from "@dim/shared";
import { logger } from "@dim/shared/node";
import { AckQueue } from "../core/AckQueue.js";
import { readJsonFile, writeJsonFile } from "../core/DataStore.js";
import {
    detectUpdates,
    failedUpdate,
    parseMemory,
    type FailureInput,
    withExpectation,
    withoutExpectation,
    type ImageMemory,
    type UpdateCause,
} from "./UpdateDetector.js";

/** Which container ran which image, across restarts and the agent's own replacement. */
const MEMORY_FILE = "container-images.json";

/** The updates the server has not acknowledged yet. */
const QUEUE_FILE = "updates-queue.json";

/**
 * How many updates are held while there is nowhere to send them. More than the activity
 * keeps: an update is rarer and worth more, and a host that was cut off for a while should
 * still hand over the whole of what it went through.
 */
const MAX_QUEUED = 1000;

/** How old a queued update may be before it is dropped unsent. */
const MAX_QUEUE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The agent's update history: it compares every state it reads with what it remembers, and
 * reports a container that now runs another image to the server.
 *
 * What this agent recreates itself it announces first (`expect`), so the update is credited
 * to the auto-update run or the action that caused it; anything else on the host is
 * `external`. An update this agent tried and that failed leaves no trace in the state, so it
 * is reported where it failed (`reportFailure`).
 */
export class UpdateHistoryService {
    private static memory: ImageMemory | null = null;

    private static readonly queue = new AckQueue<ContainerUpdate>({
        file: QUEUE_FILE,
        label: "container updates",
        parse: (value) => {
            const parsed = ContainerUpdateSchema.safeParse(value);
            return parsed.success ? parsed.data : null;
        },
        timeOf: (update) => update.occurredAt,
        maxItems: MAX_QUEUED,
        maxAgeMs: MAX_QUEUE_AGE_MS,
    });

    private static load(): ImageMemory {
        this.memory ??= parseMemory(readJsonFile(MEMORY_FILE));
        return this.memory;
    }

    /** Keeps the memory, on disk too where it changed. */
    private static save(next: ImageMemory): void {
        const changed = JSON.stringify(next) !== JSON.stringify(this.memory);
        this.memory = next;
        if (changed) writeJsonFile(MEMORY_FILE, next);
    }

    /** Compares a state the agent has read with the memory and reports what was updated. */
    static observe(state: Pick<DockerState, "containers" | "images">): void {
        const { updates, next } = detectUpdates(this.load(), state.containers, state.images, Date.now());
        for (const update of updates) {
            logger.info(
                { container: update.containerName, from: update.fromImageId, to: update.toImageId, trigger: update.trigger },
                "Container update detected",
            );
            this.queue.push({ id: randomUUID(), result: "updated", ...update });
        }
        this.save(next);
    }

    /**
     * Announces a recreate this agent is about to carry out. Written to disk at once: the
     * container may be the agent's own, and then the next agent is the one to see the update.
     */
    static expect(containerName: string, cause: UpdateCause): void {
        this.save(
            withExpectation(this.load(), containerName, {
                trigger: cause.trigger,
                correlationId: cause.id,
                at: new Date().toISOString(),
            }),
        );
    }

    /**
     * Reports an update this agent carried out and that failed before a new container took
     * the old one's place. A container that was created and then failed to start runs the
     * new image, and the next state reports it as updated.
     */
    static reportFailure(input: FailureInput): void {
        const memory = this.load();
        const announced = memory[input.containerName]?.expected;
        this.queue.push({ id: randomUUID(), ...failedUpdate(memory, input, new Date().toISOString()) });
        if (input.keepAnnouncement && announced) {
            this.expect(input.containerName, { id: announced.correlationId, trigger: announced.trigger });
        } else {
            this.save(withoutExpectation(memory, input.containerName));
        }
    }

    /**
     * Wires up the transport. `send` reports whether the batch went out; a false answer
     * leaves everything queued for the next connection.
     */
    static setTransport(send: (updates: ContainerUpdate[]) => boolean): void {
        this.queue.setTransport(send);
    }

    /** Offers everything unacknowledged to the server. Called on every reconnect too. */
    static flush(): void {
        this.queue.flush();
    }

    /** Drops what the server has stored. */
    static acknowledge(ids: string[]): void {
        this.queue.acknowledge(ids);
    }

    /** Writes the queue out now, for a shutdown. */
    static persistNow(): void {
        this.queue.persistNow();
    }
}
