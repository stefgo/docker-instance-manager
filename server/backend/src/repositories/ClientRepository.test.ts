import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/AppConfig.js", () => ({
    appConfig: { secretKey: "test-secret-key" },
    secretKeyPersisted: () => true,
}));
vi.mock("../core/Database.js", async () => {
    const { migratedMemoryDatabase } = await import("../testing/memoryDatabase.js");
    return { default: await migratedMemoryDatabase() };
});

import db from "../core/Database.js";
import { ClientRepository } from "./ClientRepository.js";

const MON = "2026-10-12T03:00:00.000Z";
const TUE = "2026-10-13T03:00:00.000Z";
const WED = "2026-10-14T03:00:00.000Z";

const runs = () => {
    const row = ClientRepository.findById("h1")!;
    return { last: row.auto_update_last_run, next: row.auto_update_next_run };
};

beforeEach(() => {
    db.exec("DELETE FROM clients");
    db.prepare("INSERT INTO clients (id, hostname) VALUES ('h1', 'host-1')").run();
});

describe("ClientRepository.updateAutoUpdateState", () => {
    it("stores what the agent reports and says that it changed", () => {
        expect(ClientRepository.updateAutoUpdateState("h1", MON, TUE)).toBe(true);
        expect(runs()).toEqual({ last: MON, next: TUE });
    });

    it("says nothing changed for the same report again", () => {
        ClientRepository.updateAutoUpdateState("h1", MON, TUE);
        expect(ClientRepository.updateAutoUpdateState("h1", MON, TUE)).toBe(false);
    });

    it("never moves the last run back, but takes the next run as it comes", () => {
        ClientRepository.updateAutoUpdateState("h1", TUE, WED);

        expect(ClientRepository.updateAutoUpdateState("h1", MON, null)).toBe(true);
        expect(runs()).toEqual({ last: TUE, next: null });

        expect(ClientRepository.updateAutoUpdateState("h1", null, null)).toBe(false);
        expect(runs()).toEqual({ last: TUE, next: null });
    });

    it("compares instants rather than strings", () => {
        ClientRepository.updateAutoUpdateState("h1", TUE, null);
        // Earlier than TUE although it sorts after it as a string.
        expect(ClientRepository.updateAutoUpdateState("h1", "2026-10-13T04:00:00+02:00", null)).toBe(false);
        expect(runs().last).toBe(TUE);
    });

    it("says nothing changed for a client that is not there", () => {
        expect(ClientRepository.updateAutoUpdateState("gone", MON, TUE)).toBe(false);
    });
});

describe("ClientRepository.recordAutoUpdateRun", () => {
    it("moves the last run forward and leaves the next run alone", () => {
        ClientRepository.updateAutoUpdateState("h1", MON, WED);

        expect(ClientRepository.recordAutoUpdateRun("h1", TUE)).toBe(true);
        expect(runs()).toEqual({ last: TUE, next: WED });
    });

    it("ignores a run older than the one it knows", () => {
        ClientRepository.recordAutoUpdateRun("h1", TUE);

        expect(ClientRepository.recordAutoUpdateRun("h1", MON)).toBe(false);
        expect(ClientRepository.recordAutoUpdateRun("h1", TUE)).toBe(false);
        expect(runs().last).toBe(TUE);
    });
});
