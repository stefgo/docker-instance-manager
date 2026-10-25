import { describe, expect, it } from "vitest";
import type { DockerContainer, DockerImage } from "@dim/shared";
import {
    EXPECTATION_KEEP_MS,
    GONE_KEEP_MS,
    detectUpdates,
    failedUpdate,
    parseMemory,
    withExpectation,
    withoutExpectation,
    type ImageMemory,
} from "./UpdateDetector.js";

const NOW = Date.parse("2026-10-25T10:00:00.000Z");
const CREATED = Date.parse("2026-10-25T09:59:50.000Z") / 1000;

const container = (over: Partial<DockerContainer> = {}): DockerContainer => ({
    id: "c-old",
    names: ["/web"],
    image: "nginx:1.27",
    imageId: "sha256:old",
    command: "nginx",
    created: CREATED,
    state: "running",
    ports: [],
    labels: {},
    configImage: "nginx:1.27",
    ...over,
});

const image = (id: string, digest: string, version?: string): DockerImage => ({
    id,
    parentId: "",
    repoTags: [],
    repoDigests: [`nginx@sha256:${digest}`],
    created: 1,
    size: 1,
    labels: version ? { "org.opencontainers.image.version": version } : null,
});

const IMAGES = [image("sha256:old", "d-old", "1.27.2"), image("sha256:new", "d-new", "1.27.3")];

/** The memory after a first state with the old container in it. */
function seen(...containers: DockerContainer[]): ImageMemory {
    return detectUpdates({}, containers, IMAGES, NOW).next;
}

const updated = container({ id: "c-new", imageId: "sha256:new" });

describe("the first state", () => {
    it("is remembered, and is no update", () => {
        const { updates, next } = detectUpdates({}, [container()], IMAGES, NOW);
        expect(updates).toEqual([]);
        expect(next.web).toEqual({
            containerId: "c-old",
            imageId: "sha256:old",
            imageRef: "nginx:1.27",
            digest: "sha256:d-old",
            version: "1.27.2",
        });
    });
});

describe("a container on another image", () => {
    it("is an update, with what it ran before and what it runs now", () => {
        const { updates } = detectUpdates(seen(container()), [updated], IMAGES, NOW);
        expect(updates).toEqual([
            {
                occurredAt: "2026-10-25T09:59:50.000Z",
                containerName: "web",
                containerId: "c-new",
                imageRef: "nginx:1.27",
                fromImageRef: null,
                fromImageId: "sha256:old",
                toImageId: "sha256:new",
                fromDigest: "sha256:d-old",
                toDigest: "sha256:d-new",
                fromVersion: "1.27.2",
                toVersion: "1.27.3",
                trigger: "external",
                correlationId: null,
            },
        ]);
    });

    // The old image may be gone by now: what it was is what the memory kept.
    it("knows the old version also once the old image has been removed", () => {
        const { updates } = detectUpdates(seen(container()), [updated], [IMAGES[1]], NOW);
        expect(updates[0]).toMatchObject({ fromVersion: "1.27.2", fromDigest: "sha256:d-old" });
    });

    it("names the old tag where the tag changed", () => {
        const moved = container({ id: "c-new", imageId: "sha256:new", image: "nginx:1.28", configImage: "nginx:1.28" });
        const { updates } = detectUpdates(seen(container()), [moved], IMAGES, NOW);
        expect(updates[0]).toMatchObject({ imageRef: "nginx:1.28", fromImageRef: "nginx:1.27", toDigest: "sha256:d-new" });
    });

    it("is reported once, not again with the next state", () => {
        const first = detectUpdates(seen(container()), [updated], IMAGES, NOW);
        expect(detectUpdates(first.next, [updated], IMAGES, NOW + 1000).updates).toEqual([]);
    });

    it("has no version where the image carries no label", () => {
        const bare = [image("sha256:old", "d-old"), image("sha256:new", "d-new")];
        const memory = detectUpdates({}, [container()], bare, NOW).next;
        expect(detectUpdates(memory, [updated], bare, NOW).updates[0]).toMatchObject({
            fromVersion: null,
            toVersion: null,
        });
    });
});

describe("a container read while it is being removed", () => {
    // Its configuration is gone by then, and Docker names its image by id.
    const removing = container({ configImage: undefined, image: "sha256:old" });

    it("keeps the tag it was known by", () => {
        const memory = detectUpdates(seen(container()), [removing], IMAGES, NOW).next;
        expect(memory.web.imageRef).toBe("nginx:1.27");
        expect(detectUpdates(memory, [updated], IMAGES, NOW).updates[0].fromImageRef).toBeNull();
    });

    it("is no change of tag where only the id is known on one side", () => {
        const memory = detectUpdates({}, [removing], IMAGES, NOW).next;
        expect(detectUpdates(memory, [updated], IMAGES, NOW).updates[0]).toMatchObject({
            imageRef: "nginx:1.27",
            fromImageRef: null,
        });
    });
});

describe("a container recreated on the same image", () => {
    it("is no update", () => {
        const recreated = container({ id: "c-new" });
        expect(detectUpdates(seen(container()), [recreated], IMAGES, NOW).updates).toEqual([]);
    });
});

describe("a Compose recreate", () => {
    // Compose renames the old container out of the way before it creates the new one.
    it("is an update, and the name in between is none", () => {
        const memory = seen(container());
        const between = detectUpdates(memory, [container({ names: ["/1a2b3c_web"] })], IMAGES, NOW);
        expect(between.updates).toEqual([]);
        const after = detectUpdates(between.next, [updated], IMAGES, NOW + 2000);
        expect(after.updates.map((u) => u.containerName)).toEqual(["web"]);
    });
});

describe("a container that went away", () => {
    it("is an update when it comes back on a new image within a day", () => {
        const gone = detectUpdates(seen(container()), [], IMAGES, NOW).next;
        expect(gone.web.goneSince).toBe(new Date(NOW).toISOString());
        const back = detectUpdates(gone, [updated], IMAGES, NOW + GONE_KEEP_MS - 1000);
        expect(back.updates).toHaveLength(1);
    });

    it("is forgotten after a day, and is then a new container", () => {
        const gone = detectUpdates(seen(container()), [], IMAGES, NOW).next;
        const forgotten = detectUpdates(gone, [], IMAGES, NOW + GONE_KEEP_MS + 1000).next;
        expect(forgotten).toEqual({});
        expect(detectUpdates(forgotten, [updated], IMAGES, NOW + GONE_KEEP_MS + 2000).updates).toEqual([]);
    });
});

describe("several containers", () => {
    it("are compared one by one", () => {
        const db = container({ id: "db-old", names: ["/db"], imageId: "sha256:old" });
        const memory = seen(container(), db);
        const { updates } = detectUpdates(memory, [updated, { ...db, id: "db-new", imageId: "sha256:new" }], IMAGES, NOW);
        expect(updates.map((u) => u.containerName)).toEqual(["web", "db"]);
    });
});

describe("an update this agent announced", () => {
    const announce = { trigger: "auto" as const, correlationId: "run-1", at: new Date(NOW).toISOString() };

    it("is credited to the operation that announced it", () => {
        const memory = withExpectation(seen(container()), "web", announce);
        expect(detectUpdates(memory, [updated], IMAGES, NOW).updates[0]).toMatchObject({
            trigger: "auto",
            correlationId: "run-1",
        });
    });

    it("waits for the container to be recreated", () => {
        const memory = withExpectation(seen(container()), "web", announce);
        const still = detectUpdates(memory, [container()], IMAGES, NOW + 1000).next;
        expect(detectUpdates(still, [updated], IMAGES, NOW + 2000).updates[0].trigger).toBe("auto");
    });

    it("is used up by a recreate on the same image", () => {
        const memory = withExpectation(seen(container()), "web", announce);
        const recreated = detectUpdates(memory, [container({ id: "c-same" })], IMAGES, NOW).next;
        expect(recreated.web.expected).toBeUndefined();
    });

    it("no longer counts once it has expired", () => {
        const memory = withExpectation(seen(container()), "web", announce);
        const late = detectUpdates(memory, [updated], IMAGES, NOW + EXPECTATION_KEEP_MS + 1000);
        expect(late.updates[0].trigger).toBe("external");
    });

    it("is dropped for a recreate that failed", () => {
        const memory = withoutExpectation(withExpectation(seen(container()), "web", announce), "web");
        expect(detectUpdates(memory, [updated], IMAGES, NOW).updates[0].trigger).toBe("external");
    });

    it("is not recorded for a container the memory does not know", () => {
        const memory = seen(container());
        expect(withExpectation(memory, "db", announce)).toBe(memory);
    });
});

describe("a failed update", () => {
    const AT = "2026-10-25T10:00:05.000Z";

    it("names what the container ran, and no new image", () => {
        const failed = failedUpdate(
            seen(container()),
            { containerName: "web", imageRef: "nginx:1.27", error: "pull access denied", cause: { id: "a-1", trigger: "manual" } },
            AT,
        );
        expect(failed).toMatchObject({
            occurredAt: AT,
            containerId: "c-old",
            fromImageId: "sha256:old",
            fromVersion: "1.27.2",
            toImageId: null,
            toVersion: null,
            trigger: "manual",
            correlationId: "a-1",
            result: "failed",
            error: "pull access denied",
        });
    });

    it("is credited to the announced operation where no cause is given", () => {
        const memory = withExpectation(seen(container()), "web", {
            trigger: "auto",
            correlationId: "run-1",
            at: new Date(NOW).toISOString(),
        });
        expect(failedUpdate(memory, { containerName: "web", imageRef: "nginx:1.27", error: "x" }, AT)).toMatchObject({
            trigger: "auto",
            correlationId: "run-1",
        });
    });

    it("is a manual one of a container the memory does not know", () => {
        expect(failedUpdate({}, { containerName: "db", imageRef: "postgres:17", error: "x" }, AT)).toMatchObject({
            containerId: null,
            fromImageId: null,
            trigger: "manual",
            correlationId: null,
        });
    });
});

describe("parseMemory", () => {
    it("reads back what was written", () => {
        const memory = withExpectation(seen(container()), "web", {
            trigger: "manual",
            correlationId: null,
            at: "2026-10-25T10:00:00.000Z",
        });
        expect(parseMemory(JSON.parse(JSON.stringify(memory)))).toEqual(memory);
    });

    it("leaves out what is not an entry, and reads nothing out of what is not a memory", () => {
        expect(parseMemory({ web: { containerId: "c" }, db: null })).toEqual({});
        expect(parseMemory([1, 2])).toEqual({});
        expect(parseMemory(null)).toEqual({});
    });

    it("drops an announcement it cannot read", () => {
        const stored = { web: { containerId: "c", imageId: "i", imageRef: "r", expected: { trigger: "sometime" } } };
        expect(parseMemory(stored).web.expected).toBeUndefined();
    });
});
