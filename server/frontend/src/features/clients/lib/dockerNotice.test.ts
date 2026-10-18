import { describe, expect, it } from "vitest";
import { formatDate } from "../../../utils";
import { dockerNotice } from "./dockerNotice";

const SINCE = "2026-10-18T10:00:00.000Z";
const STATE_AT = "2026-10-18T09:58:00.000Z";
const at = (date: string) => formatDate(date, { locale: "en-US" });

describe("dockerNotice", () => {
    it("says nothing while Docker is reachable or nothing is known", () => {
        expect(dockerNotice({ docker: { reachable: true, error: null, since: SINCE } })).toBeNull();
        expect(dockerNotice({ docker: null })).toBeNull();
    });

    it("says since when Docker is gone, why, and how old the lists are", () => {
        const notice = dockerNotice(
            { docker: { reachable: false, error: "connect ENOENT /var/run/docker.sock", since: SINCE }, dockerStateAt: STATE_AT },
            "en-US",
        );
        expect(notice?.title).toBe(`The agent cannot reach Docker, since ${at(SINCE)}`);
        expect(notice?.lines).toEqual([
            "connect ENOENT /var/run/docker.sock",
            `The lists show the last state that was read, from ${at(STATE_AT)}.`,
            "Actions on this host fail until Docker is reachable again.",
        ]);
    });

    it("says so when no state was ever read", () => {
        const notice = dockerNotice({ docker: { reachable: false, error: null, since: SINCE } }, "en-US");
        expect(notice?.lines[0]).toBe("No Docker state has been read yet.");
    });
});
