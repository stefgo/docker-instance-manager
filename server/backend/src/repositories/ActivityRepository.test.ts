import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "@dim/shared";

vi.mock("../config/AppConfig.js", () => ({
    appConfig: { secretKey: "test-secret-key" },
    secretKeyPersisted: () => true,
}));
vi.mock("../core/Database.js", async () => {
    const { migratedMemoryDatabase } = await import("../testing/memoryDatabase.js");
    return { default: await migratedMemoryDatabase() };
});

import db from "../core/Database.js";
import { ActivityRepository } from "./ActivityRepository.js";

const web = { containerName: "web", containerId: "c1" };
const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();

let ids = 0;
const store = (kind: string, second: number, over: Partial<ActivityEvent> = {}) => {
    ids += 1;
    ActivityRepository.insertMany(
        [{ id: `e${ids}`, kind, occurredAt: at(second), source: "agent", clientId: "h1", level: "info", subject: web, ...over }],
        at(second),
    );
};

beforeEach(() => {
    db.exec("DELETE FROM activity");
});

describe("ActivityRepository.answersSignal", () => {
    it("is true when the last deciding step of the container is a signal", () => {
        store("container.killed", 10);
        store("container.health", 11);
        expect(ActivityRepository.answersSignal("h1", web, at(12))).toBe(true);
    });

    it("is false once something else came after the signal", () => {
        store("container.killed", 10);
        store("container.started", 11);
        expect(ActivityRepository.answersSignal("h1", web, at(12))).toBe(false);
    });

    it("is false for a signal outside the window, or none at all", () => {
        store("container.killed", 0);
        expect(ActivityRepository.answersSignal("h1", web, at(61))).toBe(false);
        expect(ActivityRepository.answersSignal("h1", web, at(30))).toBe(true);
        expect(ActivityRepository.answersSignal("h1", { containerName: "db", containerId: "c2" }, at(30))).toBe(false);
    });

    it("keeps to its host, and matches by name where the exit has no id", () => {
        store("container.killed", 10, { subject: { containerName: "web" } });
        expect(ActivityRepository.answersSignal("h2", { containerName: "web" }, at(11))).toBe(false);
        expect(ActivityRepository.answersSignal("h1", { containerName: "web" }, at(11))).toBe(true);
        expect(ActivityRepository.answersSignal("h1", null, at(11))).toBe(false);
    });

    it("gives a tie in time to what was stored last", () => {
        store("container.killed", 10);
        store("container.died", 10);
        expect(ActivityRepository.answersSignal("h1", web, at(10))).toBe(false);
    });
});
