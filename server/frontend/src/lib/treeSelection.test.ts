import { describe, expect, it } from "vitest";
import { changeSelection, selectedLeaves, shownSelection } from "./treeSelection";

const groups = [
    { id: "a", children: [{ id: "a1" }, { id: "a2" }] },
    { id: "b", children: [{ id: "b1" }] },
    { id: "c" },
];
const keys = (...ids: string[]) => new Set<string | number>(ids);
const ids = (rows: { id: string | number }[]) => rows.map((r) => r.id);

describe("selectedLeaves", () => {
    it("takes a group as every row under it", () => {
        expect(ids(selectedLeaves(groups, keys("a")))).toEqual(["a1", "a2"]);
    });

    it("takes a row as itself", () => {
        expect(ids(selectedLeaves(groups, keys("a2", "b1")))).toEqual(["a2", "b1"]);
    });

    it("counts a row once when its group is picked as well", () => {
        expect(ids(selectedLeaves(groups, keys("a", "a1")))).toEqual(["a1", "a2"]);
    });

    it("has nothing for a group without rows", () => {
        expect(selectedLeaves(groups, keys("c"))).toEqual([]);
    });
});

describe("shownSelection", () => {
    it("ticks a group when every row under it is picked", () => {
        expect(shownSelection(groups, keys("a1", "a2"))).toEqual(keys("a1", "a2", "a"));
    });

    it("leaves a group unticked while one of its rows is not picked", () => {
        expect(shownSelection(groups, keys("a1"))).toEqual(keys("a1"));
    });

    it("drops a row the list no longer shows", () => {
        expect(shownSelection(groups, keys("b1", "gone"))).toEqual(keys("b1", "b"));
    });

    it("never ticks a group without rows", () => {
        expect(shownSelection(groups, keys("c"))).toEqual(keys());
    });
});

describe("changeSelection", () => {
    it("takes every row along when a group is ticked", () => {
        expect(changeSelection(groups, keys(), keys("a"))).toEqual(keys("a1", "a2"));
    });

    it("lets every row go when a group is unticked", () => {
        // As the list hands it over: the group's box gone, its rows' boxes still there.
        expect(changeSelection(groups, keys("a1", "a2", "b1"), keys("a1", "a2", "b1", "b"))).toEqual(keys("b1"));
    });

    it("unticks a group when one of its rows is unticked", () => {
        expect(changeSelection(groups, keys("a1", "a2"), keys("a2", "a"))).toEqual(keys("a2"));
    });

    it("changes a row by itself", () => {
        expect(changeSelection(groups, keys("a1"), keys("a1", "b1"))).toEqual(keys("a1", "b1"));
    });
});
