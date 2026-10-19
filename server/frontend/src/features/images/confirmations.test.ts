import { describe, expect, it } from "vitest";
import { describeCheck, describePruneHost } from "./confirmations";

describe("describePruneHost", () => {
    it("speaks of every unused image of the host while nothing narrows the list", () => {
        expect(describePruneHost(4).description).toContain("Every image on this host that no container uses");
    });

    it("speaks of the shown images alone while a search narrows the list", () => {
        const { title, description } = describePruneHost(2, "shown");
        expect(title).toBe("Remove 2 unused images?");
        expect(description).toContain("Only the images the list shows");
        expect(description).toContain("The others stay.");
    });
});

describe("describeCheck", () => {
    it("names how many rows it checks, in the list's own word", () => {
        expect(describeCheck({ count: 12, noun: "container", scope: "all" }).title).toBe("Check 12 containers for updates?");
        expect(describeCheck({ count: 1, noun: "project", scope: "all" }).title).toBe("Check 1 project for updates?");
    });

    it("says that every row is checked while nothing narrows the list", () => {
        expect(describeCheck({ count: 3, noun: "image", scope: "all" }).description).toContain("Every image in the list is checked.");
    });

    it("says that only the shown rows are checked while a search or a filter narrows it", () => {
        expect(describeCheck({ count: 3, noun: "image", scope: "shown" }).description)
            .toContain("Only the images the list shows are checked");
        expect(describeCheck({ count: 1, noun: "image", scope: "shown" }).description)
            .toContain("Only the image the list shows is checked");
    });

    it("speaks of the picked rows once something is picked", () => {
        const description = describeCheck({ count: 2, noun: "client", scope: "selected", selected: 2 }).description;
        expect(description).toContain("The selected clients are checked.");
    });

    it("sets what is checked against what is picked", () => {
        expect(describeCheck({ count: 2, noun: "image", scope: "selected", selected: 6 }).description)
            .toContain("2 of the 6 selected images are checked");
    });

    it("changes nothing, and says so", () => {
        expect(describeCheck({ count: 1, noun: "image", scope: "all" }).description).toContain("nothing is pulled or recreated");
    });
});
