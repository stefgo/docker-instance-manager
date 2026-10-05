import { describe, expect, it } from "vitest";
import { filterImages } from "./filterImages";
import { digestNode, repositoryNode, tagNode } from "./imageTree.testdata";
import { changeSelection, collectPrunableRefs, mergeRefs, planSelection, selectedDigests, shownSelection } from "./selection";

// `nginx` with a tag two platforms have -- one of them behind -- and an unused tag on two
// hosts; `redis` with one tag no container runs.
const amd = digestNode({ id: "nginx:1.27@amd", digest: "sha256:amd", updateStatus: "update", clientIds: ["h1", "h2"] });
const arm = digestNode({ id: "nginx:1.27@arm", digest: "sha256:arm", platform: "linux/arm64", clientIds: ["h3"] });
const old = digestNode({ id: "nginx:1.25@old", tag: "1.25", digest: "sha256:old", imageIds: ["sha256:o1"], containerIds: [], clientIds: ["h1"] });
const older = digestNode({ id: "nginx:1.25@older", tag: "1.25", digest: "sha256:older", imageIds: ["sha256:o2"], containerIds: [], clientIds: ["h2"] });
const redis = digestNode({ id: "redis:7@r", repository: "redis", tag: "7", digest: "sha256:r", imageIds: ["sha256:r1"], containerIds: [], clientIds: ["h1"] });

const current = tagNode({ id: "nginx:1.27", children: [amd, arm] });
const unused = tagNode({ id: "nginx:1.25", tag: "1.25", containerIds: [], children: [old, older] });
const repos = [
    repositoryNode({ id: "nginx", children: [current, unused] }),
    repositoryNode({ id: "redis", repository: "redis", containerIds: [], children: [tagNode({ id: "redis:7", repository: "redis", tag: "7", containerIds: [], children: [redis] })] }),
];

const keys = (...ids: string[]) => new Set<string | number>(ids);
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

describe("selectedDigests", () => {
    it("takes a repository and a tag as every digest row under them", () => {
        expect(ids(selectedDigests(repos, keys("nginx")))).toEqual(ids([amd, arm, old, older]));
        expect(ids(selectedDigests(repos, keys("nginx:1.27")))).toEqual(ids([amd, arm]));
    });

    it("takes a digest row as itself, and once when its tag is picked as well", () => {
        expect(ids(selectedDigests(repos, keys(arm.id)))).toEqual([arm.id]);
        expect(selectedDigests(repos, keys("nginx:1.27", arm.id))).toHaveLength(2);
    });

    it("takes a tag as the rows a search left of it", () => {
        expect(ids(selectedDigests(filterImages(repos, "arm64"), keys("nginx:1.27")))).toEqual([arm.id]);
    });
});

describe("shownSelection", () => {
    it("ticks a tag once every digest row under it is picked, and a repository once every tag is", () => {
        expect([...shownSelection(repos, keys(amd.id))]).toEqual([amd.id]);
        expect(shownSelection(repos, keys(amd.id, arm.id)).has("nginx:1.27")).toBe(true);
        expect(shownSelection(repos, keys(amd.id, arm.id)).has("nginx")).toBe(false);
        expect(shownSelection(repos, keys(amd.id, arm.id, old.id, older.id)).has("nginx")).toBe(true);
    });

    it("drops what the list no longer shows, and reads a tag by the rows that are left", () => {
        const shown = shownSelection(filterImages(repos, "arm64"), keys(amd.id, arm.id, redis.id));
        expect([...shown].sort()).toEqual(["nginx", "nginx:1.27", arm.id].sort());
    });
});

describe("changeSelection", () => {
    const pick = (before: Set<string | number>, change: (shown: Set<string | number>) => void) => {
        const next = shownSelection(repos, before);
        change(next);
        return [...changeSelection(repos, before, next)].sort();
    };

    it("takes every digest row along when a tag or a repository is ticked", () => {
        expect(pick(keys(), (next) => next.add("nginx:1.27"))).toEqual(ids([amd, arm]));
        expect(pick(keys(amd.id), (next) => next.add("nginx"))).toEqual(ids([amd, arm, old, older]));
    });

    it("lets them all go when a tag or a repository is unticked", () => {
        const all = keys(amd.id, arm.id, old.id, older.id);
        expect(pick(all, (next) => next.delete("nginx:1.27"))).toEqual(ids([old, older]));
        expect(pick(all, (next) => next.delete("nginx"))).toEqual([]);
    });

    it("changes a digest row by itself", () => {
        expect(pick(keys(amd.id, arm.id), (next) => next.delete(arm.id))).toEqual([amd.id]);
        expect(pick(keys(amd.id), (next) => next.add(redis.id))).toEqual(ids([amd, redis]));
    });
});

describe("planSelection", () => {
    it("has nothing to do for an empty selection", () => {
        expect(planSelection(repos, keys())).toEqual({ rows: 0, check: [], pull: [], recreate: false, prune: [] });
    });

    it("checks the tagged images a container runs, once per tag and digest", () => {
        const plan = planSelection(repos, keys("nginx", "redis"));
        expect(plan.rows).toBe(5);
        expect(plan.check.map((c) => c.imageRef)).toEqual(["nginx:1.27", "nginx:1.27"]);
    });

    it("pulls the rows that are behind, on their hosts, and says whether containers are recreated", () => {
        const plan = planSelection(repos, keys("nginx"));
        expect(plan.pull).toEqual([{ imageRef: "nginx:1.27", clientIds: ["h1", "h2"] }]);
        expect(plan.recreate).toBe(true);
        expect(planSelection(repos, keys(arm.id)).pull).toEqual([]);
    });

    it("prunes a tag picked whole by its name, on the hosts of its rows", () => {
        expect(planSelection(repos, keys("nginx")).prune).toEqual([{ ref: "nginx:1.25", clientIds: ["h1", "h2"] }]);
    });

    it("prunes only the picked images of a tag picked in part", () => {
        expect(planSelection(repos, keys(old.id, amd.id)).prune).toEqual([{ ref: "sha256:o1", clientIds: ["h1"] }]);
    });
});

describe("collectPrunableRefs", () => {
    it("leaves out what a container uses", () => {
        expect(collectPrunableRefs(current)).toEqual([]);
        expect(collectPrunableRefs(repos[0])).toEqual([{ ref: "nginx:1.25", clientIds: ["h1", "h2"] }]);
    });
});

describe("mergeRefs", () => {
    it("names a reference once, with the hosts of every entry", () => {
        expect(mergeRefs([{ ref: "a", clientIds: ["h1"] }, { ref: "a", clientIds: ["h2", "h1"] }])).toEqual([
            { ref: "a", clientIds: ["h1", "h2"] },
        ]);
    });
});
