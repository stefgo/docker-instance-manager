import { describe, expect, it } from "vitest";
import { describeStartSelection, describeStopSelection } from "./confirmations";

const on = (...clientIds: string[]) => clientIds.map((clientId) => ({ clientId }));

describe("describeStartSelection", () => {
    it("names the containers and the hosts it starts on", () => {
        expect(describeStartSelection(on("a", "a", "b"), 3).title).toBe("Start 3 containers on 2 hosts?");
    });

    it("says nothing of the rest while every picked container is reached", () => {
        expect(describeStartSelection(on("a", "b"), 2).description).not.toContain("selected");
    });

    it("sets what it reaches against what is picked", () => {
        expect(describeStartSelection(on("a"), 4).description).toContain("1 of the 4 selected containers is reached");
    });
});

describe("describeStopSelection", () => {
    it("names the containers and the hosts it stops on", () => {
        expect(describeStopSelection(on("a", "b"), 2).title).toBe("Stop 2 containers on 2 hosts?");
    });

    it("sets what it reaches against what is picked", () => {
        expect(describeStopSelection(on("a", "a"), 5).description).toContain("2 of the 5 selected containers are reached");
    });
});
