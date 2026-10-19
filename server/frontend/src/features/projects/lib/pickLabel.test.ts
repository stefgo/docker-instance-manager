import { describe, expect, it } from "vitest";
import { pickLabel } from "./pickLabel";

describe("pickLabel", () => {
    it("counts the containers and the hosts they run on", () => {
        expect(pickLabel([{ clientId: "h1" }, { clientId: "h1" }, { clientId: "h2" }])).toBe("3 containers on 2 clients selected");
    });

    it("names one of each in the singular", () => {
        expect(pickLabel([{ clientId: "h1" }])).toBe("1 container on 1 client selected");
    });
});
