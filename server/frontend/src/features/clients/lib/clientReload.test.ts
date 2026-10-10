import { describe, expect, it } from "vitest";
import { CLIENT_STATUS, CONNECTION_MODE } from "@dim/shared";
import { reloadStep } from "./clientReload";

describe("reloadStep", () => {
    it("fetches the Docker state of a connected client, whichever side dialled", () => {
        expect(reloadStep({ status: CLIENT_STATUS.ONLINE, connectionMode: CONNECTION_MODE.INBOUND })).toBe("refresh");
        expect(reloadStep({ status: CLIENT_STATUS.ONLINE, connectionMode: CONNECTION_MODE.OUTBOUND })).toBe("refresh");
    });

    it("dials an offline client the server connects to", () => {
        expect(reloadStep({ status: CLIENT_STATUS.OFFLINE, connectionMode: CONNECTION_MODE.OUTBOUND })).toBe("reconnect");
    });

    it("has nothing to do for an offline client that dials in itself", () => {
        expect(reloadStep({ status: CLIENT_STATUS.OFFLINE, connectionMode: CONNECTION_MODE.INBOUND })).toBeNull();
    });
});
