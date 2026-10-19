import { describe, expect, it } from "vitest";
import { type AutoUpdateEnrollment, NOT_ENROLLED } from "../autoUpdate";
import { earliestNextCheck, nextCheckOf, scheduleKeyFor } from "./nextCheck";

const enrolled = (over: Partial<AutoUpdateEnrollment>): AutoUpdateEnrollment => ({
    ...NOT_ENROLLED,
    source: "label",
    ...over,
});

const host = { schedule: "host", cron: "0 3 * * *", nextRun: "2026-10-21T03:00:00.000Z" };
const web = { schedule: "project:web", cron: "0 4 * * 0", nextRun: "2026-10-25T04:00:00.000Z" };

describe("scheduleKeyFor", () => {
    it("puts a container outside every project on the host schedule", () => {
        expect(scheduleKeyFor(enrolled({ source: "label" }))).toBe("host");
    });

    it("puts a project's container on the project schedule, its label notwithstanding", () => {
        expect(scheduleKeyFor(enrolled({ source: "project", projectId: "web" }))).toBe("project:web");
        expect(scheduleKeyFor(enrolled({ source: "label", projectId: "web" }))).toBe("project:web");
    });

    it("puts a container in conflict that its label enrols on the host schedule", () => {
        const conflict = [{ id: "a", name: "a" }, { id: "b", name: "b" }];
        expect(scheduleKeyFor(enrolled({ source: "label", conflict }))).toBe("host");
    });

    it("puts a container that is not enrolled on none", () => {
        expect(scheduleKeyFor(NOT_ENROLLED)).toBeNull();
        expect(scheduleKeyFor({ ...NOT_ENROLLED, projectId: "web" })).toBeNull();
    });
});

describe("nextCheckOf", () => {
    it("reads the next run of the container's own schedule, not the earliest one", () => {
        expect(nextCheckOf(enrolled({ source: "project", projectId: "web" }), [host, web])).toEqual(web);
        expect(nextCheckOf(enrolled({ source: "label" }), [host, web])).toEqual(host);
    });

    it("has none where the agent did not plan the schedule or reported nothing", () => {
        const inProject = enrolled({ source: "label", projectId: "off" });
        expect(nextCheckOf(inProject, [host, web])).toBeNull();
        expect(nextCheckOf(enrolled({ source: "label" }), null)).toBeNull();
        expect(nextCheckOf(enrolled({ source: "label" }), [{ ...host, nextRun: null }])).toBeNull();
    });

    it("has none for a container that is not enrolled", () => {
        expect(nextCheckOf(NOT_ENROLLED, [host])).toBeNull();
    });
});

describe("earliestNextCheck", () => {
    it("takes the earliest run and reads past the hosts without one", () => {
        expect(earliestNextCheck([web, null, host])).toEqual(host);
    });

    it("compares instants rather than strings", () => {
        const later = { ...host, nextRun: "2026-10-21T04:30:00+02:00" };
        expect(earliestNextCheck([host, later])).toEqual(later);
    });

    it("has none where no host has one", () => {
        expect(earliestNextCheck([])).toBeNull();
        expect(earliestNextCheck([null, null])).toBeNull();
    });
});
