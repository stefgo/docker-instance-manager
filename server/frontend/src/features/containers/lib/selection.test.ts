import { describe, expect, it } from "vitest";
import { check, client, container, dockerState, image, offline } from "../../../lib/fleet.testdata";
import { buildContainerGroups } from "./containerGroups";
import { filterContainers } from "./filterContainers";
import { changeSelection, planSelection, selectedHostRows, shownSelection } from "./selection";

// `web` on three hosts, one of them offline; `db` (stopped) and the never-checked `cache` on the first.
const groups = buildContainerGroups({
    clients: [client("h1", { displayName: "alpha" }), client("h2"), offline("h3")],
    dockerStates: {
        h1: dockerState(
            [
                container(),
                container({ id: "c2", names: ["/db"], state: "exited" }),
                container({ id: "c5", names: ["/cache"], image: "redis:7", configImage: "redis:7", imageId: "sha256:bbb" }),
            ],
            [image({ updateCheck: check(true) }), image({ id: "sha256:bbb", repoTags: ["redis:7"] })],
        ),
        h2: dockerState([container({ id: "c3" })], [image({ updateCheck: check(false) })]),
        h3: dockerState([container({ id: "c4", state: "exited" })], [image({ updateCheck: check(true) })]),
    },
    assignment: new Map(),
    labelFilter: null,
});

const group = (name: string) => groups.find((g) => g.name === name)!;
const hostRow = (name: string, clientId: string) => group(name).children!.find((c) => c.clientId === clientId)!;
const keys = (...ids: string[]) => new Set<string | number>(ids);
const containerIds = (instances: { containerId: string }[]) => instances.map((i) => i.containerId).sort();

describe("selectedHostRows", () => {
    it("takes a group as every host row under it", () => {
        expect(selectedHostRows(groups, keys(group("web").id)).map((r) => r.clientId).sort()).toEqual(["h1", "h2", "h3"]);
    });

    it("takes a host row as itself", () => {
        expect(selectedHostRows(groups, keys(hostRow("web", "h2").id)).map((r) => r.containerId)).toEqual(["c3"]);
    });

    it("counts a host row once when its group is picked as well", () => {
        const picked = keys(group("web").id, hostRow("web", "h2").id);
        expect(selectedHostRows(groups, picked)).toHaveLength(3);
    });

    it("takes a group as the rows a filter left of it", () => {
        const filtered = filterContainers(groups, { update: "current" });
        expect(selectedHostRows(filtered, keys(group("web").id)).map((r) => r.clientId)).toEqual(["h2"]);
    });
});

describe("shownSelection", () => {
    it("ticks a group once every host row under it is picked", () => {
        const some = keys(hostRow("web", "h1").id, hostRow("web", "h2").id);
        expect(shownSelection(groups, some).has(group("web").id)).toBe(false);

        const all = keys(...group("web").children!.map((c) => c.id));
        expect(shownSelection(groups, all).has(group("web").id)).toBe(true);
    });

    it("drops what the list no longer shows, and reads a group by the rows that are left", () => {
        const picked = keys(hostRow("web", "h2").id, hostRow("db", "h1").id);
        const filtered = filterContainers(groups, { update: "current" });
        // Only web@h2 is current: it is the group's one row there, so the group is ticked.
        expect(shownSelection(filtered, picked)).toEqual(keys(hostRow("web", "h2").id, group("web").id));
    });
});

describe("changeSelection", () => {
    const allOfWeb = keys(...group("web").children!.map((c) => c.id));

    it("takes every host row along when a group is ticked", () => {
        expect(changeSelection(groups, keys(), keys(group("web").id))).toEqual(allOfWeb);
    });

    it("lets them all go when the group is unticked", () => {
        const shown = shownSelection(groups, allOfWeb);
        shown.delete(group("web").id);
        expect(changeSelection(groups, allOfWeb, shown)).toEqual(keys());
    });

    it("unticks only the host row that was unticked, and the group with it", () => {
        const shown = shownSelection(groups, allOfWeb);
        shown.delete(hostRow("web", "h3").id);
        const after = changeSelection(groups, allOfWeb, shown);
        expect(after).toEqual(keys(hostRow("web", "h1").id, hostRow("web", "h2").id));
        expect(shownSelection(groups, after).has(group("web").id)).toBe(false);
    });

    it("picks every group of the list for 'select all'", () => {
        const all = new Set<string | number>(groups.map((g) => g.id));
        expect(changeSelection(groups, keys(), all).size).toBe(5);
    });

    it("forgets a picked row the list does not show", () => {
        const filtered = filterContainers(groups, { update: "current" });
        const after = changeSelection(filtered, keys(hostRow("db", "h1").id), keys(hostRow("web", "h2").id));
        expect(after).toEqual(keys(hostRow("web", "h2").id));
    });
});

describe("planSelection", () => {
    it("has nothing to do for an empty selection", () => {
        expect(planSelection(groups, keys())).toEqual({ rows: 0, check: [], pull: [], start: [], stop: [] });
    });

    it("pulls only on connected hosts that are behind, limited to the picked containers", () => {
        // web: h1 behind, h2 current, h3 behind but offline. db shares web's image on h1.
        const plan = planSelection(groups, keys(group("web").id));
        expect(plan.pull).toEqual([{ imageRef: "nginx:1.27", clientIds: ["h1"], containerIds: { h1: ["c1"] } }]);
    });

    it("merges the containers of one reference into one pull", () => {
        const plan = planSelection(groups, keys(group("web").id, group("db").id));
        expect(plan.pull).toHaveLength(1);
        expect(plan.pull[0].containerIds).toEqual({ h1: ["c1", "c2"] });
    });

    it("checks every reference once, whatever its hosts say", () => {
        const plan = planSelection(groups, keys(group("web").id, group("db").id, group("cache").id));
        expect(plan.check.map((c) => c.imageRef).sort()).toEqual(["nginx:1.27", "redis:7"]);
    });

    it("starts what is stopped and stops what runs, on connected hosts only", () => {
        const plan = planSelection(groups, keys(group("web").id, group("db").id));
        expect(plan.rows).toBe(4);
        // web@h3 is stopped, but its host is offline.
        expect(containerIds(plan.start)).toEqual(["c2"]);
        expect(containerIds(plan.stop)).toEqual(["c1", "c3"]);
    });

    it("acts on what a filter left: every hit of 'has update' that can be reached", () => {
        const filtered = filterContainers(groups, { update: "update" });
        const all = new Set<string | number>(filtered.map((g) => g.id));
        const plan = planSelection(filtered, all);
        expect(plan.rows).toBe(3);
        expect(plan.pull).toEqual([{ imageRef: "nginx:1.27", clientIds: ["h1"], containerIds: { h1: ["c1", "c2"] } }]);
    });
});
