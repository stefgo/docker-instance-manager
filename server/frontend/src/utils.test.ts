import { describe, expect, it } from "vitest";
import {
    EMPTY_VALUE,
    clientName,
    describeFailure,
    formatBytes,
    formatDate,
    formatTime,
    getErrorMessage,
    humanDuration,
    plural,
} from "./utils";

describe("formatDate", () => {
    // Noon UTC is the same calendar day in every zone the tests may run in.
    const date = "2026-10-03T12:00:30Z";

    it("writes day, month, year and the time without seconds", () => {
        expect(formatDate(date)).toMatch(/^03\.10\.2026, \d{2}:\d{2}$/);
    });

    it("adds the seconds where asked", () => {
        expect(formatDate(date, { seconds: true })).toMatch(/^03\.10\.2026, \d{2}:\d{2}:30$/);
    });

    it("takes a Date and a timestamp as well", () => {
        expect(formatDate(new Date(date))).toBe(formatDate(date));
        expect(formatDate(Date.parse(date))).toBe(formatDate(date));
    });

    it("reads SQLite's format as UTC", () => {
        expect(formatDate("2026-10-03 12:00:30")).toBe(formatDate(date));
    });

    it("shows the empty value when there is no date, or none that parses", () => {
        expect(formatDate(null)).toBe(EMPTY_VALUE);
        expect(formatDate(undefined)).toBe(EMPTY_VALUE);
        expect(formatDate("")).toBe(EMPTY_VALUE);
        expect(formatDate("yesterday")).toBe(EMPTY_VALUE);
    });
});

describe("formatTime", () => {
    it("is the time of day alone, with seconds", () => {
        expect(formatTime("2026-10-03T12:00:30Z")).toMatch(/^\d{2}:\d{2}:30$/);
    });

    it("shows the empty value when there is no date", () => {
        expect(formatTime(null)).toBe(EMPTY_VALUE);
        expect(formatTime("yesterday")).toBe(EMPTY_VALUE);
    });
});

describe("formatBytes", () => {
    it("picks the unit by powers of 1024", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(500)).toBe("500.0 B");
        expect(formatBytes(1024)).toBe("1.0 KB");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
        expect(formatBytes(2.5 * 1024 ** 3)).toBe("2.5 GB");
    });
});

describe("humanDuration", () => {
    const s = 1000;
    const m = 60 * s;
    const h = 60 * m;
    const d = 24 * h;

    it("writes seconds", () => {
        expect(humanDuration(0)).toBe("Less than a second");
        expect(humanDuration(999)).toBe("Less than a second");
        expect(humanDuration(1 * s)).toBe("1 second");
        expect(humanDuration(59 * s)).toBe("59 seconds");
    });

    it("writes minutes", () => {
        expect(humanDuration(60 * s)).toBe("About a minute");
        expect(humanDuration(119 * s)).toBe("About a minute");
        expect(humanDuration(2 * m)).toBe("2 minutes");
        expect(humanDuration(59 * m)).toBe("59 minutes");
    });

    it("rounds hours to the nearest", () => {
        expect(humanDuration(60 * m)).toBe("About an hour");
        expect(humanDuration(89 * m)).toBe("About an hour");
        expect(humanDuration(90 * m)).toBe("2 hours");
        expect(humanDuration(47 * h)).toBe("47 hours");
    });

    it("writes days, weeks, months and years", () => {
        expect(humanDuration(48 * h)).toBe("2 days");
        expect(humanDuration(13 * d)).toBe("13 days");
        expect(humanDuration(14 * d)).toBe("2 weeks");
        expect(humanDuration(59 * d)).toBe("8 weeks");
        expect(humanDuration(60 * d)).toBe("2 months");
        expect(humanDuration(729 * d)).toBe("24 months");
        expect(humanDuration(730 * d)).toBe("2 years");
    });

    it("clamps a negative duration: the host's clock may be ahead of the browser's", () => {
        expect(humanDuration(-5 * m)).toBe("Less than a second");
    });
});

describe("plural", () => {
    it("adds an s for anything but one", () => {
        expect(plural(0, "host")).toBe("0 hosts");
        expect(plural(1, "host")).toBe("1 host");
        expect(plural(3, "host")).toBe("3 hosts");
    });

    it("takes the plural of a noun that has its own", () => {
        expect(plural(1, "registry", "registries")).toBe("1 registry");
        expect(plural(2, "registry", "registries")).toBe("2 registries");
    });
});

describe("clientName", () => {
    it("is the display name, or the hostname while there is none", () => {
        expect(clientName({ displayName: "One", hostname: "docker-01" })).toBe("One");
        expect(clientName({ displayName: null, hostname: "docker-01" })).toBe("docker-01");
        expect(clientName({ hostname: "docker-01" })).toBe("docker-01");
    });

    it("falls back for an empty display name as well", () => {
        expect(clientName({ displayName: "", hostname: "docker-01" })).toBe("docker-01");
    });
});

describe("getErrorMessage and describeFailure", () => {
    it("reads an Error, a string and anything else", () => {
        expect(getErrorMessage(new Error("boom"))).toBe("boom");
        expect(getErrorMessage("boom")).toBe("boom");
        expect(getErrorMessage({ code: 1 })).toBe('{"code":1}');
    });

    it("still gives text for what cannot be serialised", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(getErrorMessage(circular)).toBe("[object Object]");
    });

    it("puts the server's message under the title", () => {
        expect(describeFailure("Could not save", new Error("boom"))).toEqual({
            title: "Could not save",
            description: "boom",
        });
    });
});
