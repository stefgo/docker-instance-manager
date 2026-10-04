import { describe, expect, it } from "vitest";
import { CLIENT_STATUS } from "@dim/shared";
import { clientStatusOrder } from "./clientStatus";

const offline = (lastSeen: string | null) => ({ status: CLIENT_STATUS.OFFLINE, lastSeen });

describe("clientStatusOrder", () => {
    it("puts the host that is gone longest first", () => {
        const older = offline("2026-10-01T08:00:00.000Z");
        const newer = offline("2026-10-04T08:00:00.000Z");
        expect(clientStatusOrder(older)).toBeLessThan(clientStatusOrder(newer));
    });

    it("puts a connected host after every offline one, whatever its last date", () => {
        const online = { status: CLIENT_STATUS.ONLINE, lastSeen: "2020-01-01T00:00:00.000Z" };
        expect(clientStatusOrder(online)).toBeGreaterThan(clientStatusOrder(offline("2026-10-04T08:00:00.000Z")));
    });

    it("puts a host that never connected before all of them", () => {
        expect(clientStatusOrder(offline(null))).toBe(0);
    });

    it("reads SQLite's date format as well", () => {
        expect(clientStatusOrder(offline("2026-10-04 08:00:00"))).toBe(Date.parse("2026-10-04T08:00:00Z"));
    });
});
