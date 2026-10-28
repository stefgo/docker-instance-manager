import { describe, expect, it } from "vitest";
import { type Client } from "@dim/shared";
import { describePruneSystem } from "./confirmations";

const client = { id: "c1", hostname: "host-1", displayName: "Web" } as Client;

describe("describePruneSystem", () => {
    it("names the host and asks as a destructive action", () => {
        const { title, variant } = describePruneSystem(client);
        expect(title).toBe('Prune Docker on "Web"?');
        expect(variant).toBe("danger");
    });

    it("says what is kept as well as what goes", () => {
        const { description } = describePruneSystem(client);
        expect(description).toContain("stopped container");
        expect(description).toContain("Volumes and tagged images are kept");
    });
});
