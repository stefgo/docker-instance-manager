import { describe, expect, it } from "vitest";
import { formatDate } from "../../../utils";
import { offlineNotice } from "./offlineNotice";

const LAST_SEEN = "2026-10-04T09:47:41.000Z";
const STATE_AT = "2026-10-04T09:40:00.000Z";
const at = (date: string) => formatDate(date, { locale: "en-US" });

describe("offlineNotice", () => {
    it("says since when the client is gone and how old its last state is", () => {
        const notice = offlineNotice({ lastSeen: LAST_SEEN, dockerStateAt: STATE_AT }, "en-US");
        expect(notice.title).toBe(`This client is offline, last seen ${at(LAST_SEEN)}`);
        expect(notice.lines[0]).toContain(`is from ${at(STATE_AT)}`);
        expect(notice.lines[1]).toBe("Actions are possible again once it is connected.");
    });

    it("says so when the client never reported a state", () => {
        const notice = offlineNotice({ lastSeen: LAST_SEEN, dockerStateAt: null }, "en-US");
        expect(notice.lines[0]).toBe("It has not reported a Docker state yet.");
    });

    it("does not invent a date for a client that never connected", () => {
        const notice = offlineNotice({ lastSeen: null }, "en-US");
        expect(notice.title).toBe("This client has not connected yet");
    });
});
