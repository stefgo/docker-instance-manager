import { describe, expect, it } from "vitest";
import { type PullTarget, describeCheck, describePruneHost, describePull, pullReach } from "./confirmations";

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

describe("pullReach", () => {
    it("counts the containers where every target names its own", () => {
        expect(pullReach([
            { imageRef: "nginx:1", clientIds: ["h1", "h2"], containerIds: { h1: ["c1", "c2"], h2: ["c3"] } },
            { imageRef: "redis:7", clientIds: ["h1"], containerIds: { h1: ["c4"] } },
        ])).toEqual({ count: 4, noun: "container" });
    });

    it("counts the references where a target leaves its containers open", () => {
        expect(pullReach([
            { imageRef: "nginx:1", clientIds: ["h1"] },
            { imageRef: "nginx:1", clientIds: ["h2"] },
            { imageRef: "redis:7", clientIds: ["h1"], containerIds: { h1: ["c4"] } },
        ])).toEqual({ count: 2, noun: "image" });
    });
});

describe("describePull", () => {
    const nginx: Required<PullTarget> = { imageRef: "nginx:1", clientIds: ["h1"], containerIds: { h1: ["c1"] } };
    const both: Required<PullTarget> = { imageRef: "nginx:1", clientIds: ["h1", "h2"], containerIds: { h1: ["c1"], h2: ["c2", "c3"] } };

    it("names a row's single image and the containers it is limited to", () => {
        const { title, description, confirmLabel } = describePull({ targets: [nginx] });
        expect(title).toBe('Pull & recreate "nginx:1"?');
        expect(description).toBe(
            "The new image is pulled on 1 host, and the container is recreated from it if it runs the old one. Other containers on the same image are left as they are. The containers are unavailable while that happens.",
        );
        expect(confirmLabel).toBe("Pull & recreate");
    });

    it("says that every container on the image is recreated where the pull names none", () => {
        expect(describePull({ targets: [{ imageRef: "nginx:1", clientIds: ["h1"] }] }).description)
            .toContain("every container running the old one is recreated from it.");
    });

    it("pulls without a recreate where no container uses the image", () => {
        const { title, description } = describePull({ targets: [{ imageRef: "nginx:1", clientIds: ["h1"] }], recreate: false });
        expect(title).toBe('Pull "nginx:1"?');
        expect(description).toContain("No container uses it, so nothing is recreated.");
    });

    it("counts the images of a pull of several", () => {
        const redis = { imageRef: "redis:7", clientIds: ["h2"] };
        expect(describePull({ targets: [{ imageRef: "nginx:1", clientIds: ["h1"] }, redis] }).title)
            .toBe("Pull & recreate 2 images?");
    });

    it("says no part of a list on a row's own pull", () => {
        expect(describePull({ targets: [nginx] }).description).not.toContain("reached");
    });

    it("says which part of the list a header's pull reaches", () => {
        expect(describePull({ targets: [both], scope: "all" }).description)
            .toMatch(/^Every container in the list that has an update is reached\. /);
        expect(describePull({ targets: [both], scope: "shown" }).description)
            .toMatch(/^Only the containers the list shows that have an update are reached: a search or a filter narrows it\. /);
        expect(describePull({ targets: [both], scope: "selected", selected: 3 }).description)
            .toMatch(/^The selected containers are reached\. /);
    });

    it("sets what it reaches against what is picked", () => {
        expect(describePull({ targets: [nginx], scope: "selected", selected: 4 }).description)
            .toMatch(/^1 of the 4 selected containers is reached; the others have nothing to pull\. /);
    });

    it("names a subject's containers, counted by the mode the dialog is on", () => {
        const request = { targets: [nginx], forced: [both], subject: "web", scope: "all" as const };
        expect(describePull(request).title).toBe('Pull & recreate 1 container of "web"?');
        expect(describePull(request).confirmLabel).toBe("Pull & recreate 1 container");

        const forced = describePull(request, "force");
        expect(forced.title).toBe('Pull & recreate 3 containers of "web"?');
        expect(forced.confirmLabel).toBe("Pull & recreate 3 containers");
        expect(forced.description).toMatch(/^Every container in the list is reached\. /);
        expect(forced.description).toContain("pulled on 2 hosts");
        expect(forced.description).toContain("whether they run the new one already or not");
    });
});
