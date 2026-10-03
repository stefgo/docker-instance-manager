import { describe, expect, it } from "vitest";
import { EMPTY_VALUE, formatDate } from "../../../utils";
import { summarizeChecks } from "./checkSummary";

const OLDER = "2026-10-01T12:00:00.000Z";
const NEWER = "2026-10-03T12:00:00.000Z";

describe("summarizeChecks", () => {
    it("has nothing to say while no host has an answer", () => {
        expect(summarizeChecks([])).toEqual({ lastChecked: EMPTY_VALUE, result: null });
        expect(summarizeChecks([{}, { error: "never asked" }])).toEqual({ lastChecked: EMPTY_VALUE, result: null });
    });

    it("is OK where every host got an answer", () => {
        expect(summarizeChecks([{ checkedAt: OLDER }])).toEqual({ lastChecked: formatDate(OLDER), result: "OK" });
    });

    it("takes the newest answer for `last checked`, in whatever order they come", () => {
        expect(summarizeChecks([{ checkedAt: NEWER }, { checkedAt: OLDER }]).lastChecked).toBe(formatDate(NEWER));
        expect(summarizeChecks([{ checkedAt: OLDER }, { checkedAt: NEWER }]).lastChecked).toBe(formatDate(NEWER));
    });

    it("is the error where every host got one", () => {
        const answers = [
            { checkedAt: OLDER, error: "rate limited" },
            { checkedAt: NEWER, error: "rate limited" },
        ];
        expect(summarizeChecks(answers).result).toBe("rate limited");
    });

    it("adds the count where only some hosts got an error", () => {
        const answers = [{ checkedAt: OLDER, error: "rate limited" }, { checkedAt: NEWER }, { checkedAt: NEWER }];
        expect(summarizeChecks(answers).result).toBe("rate limited (1 of 3 hosts)");
    });

    it("does not count a host that was never checked", () => {
        expect(summarizeChecks([{ checkedAt: OLDER, error: "rate limited" }, {}]).result).toBe("rate limited");
    });
});
