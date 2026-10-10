import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS } from "@dim/shared";
import { DEFAULT_CHOICE, EVENT_LEVEL_GROUPS, choiceOf, levelChoices, withChoice } from "./eventLevels";

describe("EVENT_LEVEL_GROUPS", () => {
    it("holds every kind once", () => {
        const kinds = EVENT_LEVEL_GROUPS.flatMap((group) => group.kinds);
        expect([...kinds].sort()).toEqual([...ACTIVITY_KINDS].sort());
    });

    it("has a heading for every kind this build knows", () => {
        expect(EVENT_LEVEL_GROUPS.map((group) => group.label)).not.toContain("Other");
    });

    it("keeps the kinds of one prefix together, wherever they stand in the list", () => {
        const autoUpdate = EVENT_LEVEL_GROUPS.find((group) => group.label === "Auto-update");
        expect(autoUpdate?.kinds).toContain("autoupdate.run");
        expect(autoUpdate?.kinds).toContain("autoupdate.conflict");
    });
});

describe("levelChoices", () => {
    it("names the level a kind has when left alone", () => {
        expect(levelChoices("container.died")[0]).toEqual({ value: DEFAULT_CHOICE, label: "Default (info / warning)" });
    });

    it("offers none for a kind that can be switched off", () => {
        expect(levelChoices("client.connected").map((c) => c.value)).toEqual([
            DEFAULT_CHOICE, "trace", "info", "warning", "error", "none",
        ]);
    });

    it("does not offer none for a kind a group depends on", () => {
        expect(levelChoices("action.requested").map((c) => c.value)).not.toContain("none");
    });
});

describe("choiceOf", () => {
    it("is the default for a kind the setting does not name", () => {
        expect(choiceOf("container.died=error", "image.pulled")).toBe(DEFAULT_CHOICE);
    });

    it("is what the setting says", () => {
        expect(choiceOf("container.died=error, client.connected=none", "client.connected")).toBe("none");
    });
});

describe("withChoice", () => {
    it("adds an entry", () => {
        expect(withChoice("", "container.died", "error")).toBe("container.died=error");
    });

    it("replaces an entry", () => {
        expect(withChoice("container.died=error, image.pulled=trace", "container.died", "info")).toBe(
            "image.pulled=trace, container.died=info",
        );
    });

    it("removes the entry of a kind set back to its default", () => {
        expect(withChoice("container.died=error, image.pulled=trace", "container.died", DEFAULT_CHOICE)).toBe(
            "image.pulled=trace",
        );
    });

    // Written into config.yaml by hand, for a kind only a newer agent reports.
    it("keeps an entry this page has no row for", () => {
        expect(withChoice("volume.pruned=none", "container.died", "error")).toBe(
            "volume.pruned=none, container.died=error",
        );
    });

    it("does not write what the server would refuse", () => {
        expect(withChoice("", "autoupdate.run", "none")).toBe("");
    });
});
