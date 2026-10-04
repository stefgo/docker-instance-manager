import { describe, expect, it } from "vitest";
import { check, client, container, dockerState, image, project } from "../../../lib/fleet.testdata";
import { hostStates, projectAssignment } from "../../projects/lib/projectMembers";
import { type ImageTreeInput, buildImageTree } from "./imageTree";

const tree = (
    input: Pick<ImageTreeInput, "clients" | "dockerStates" | "projectId"> & {
        projects?: Parameters<typeof projectAssignment>[1];
    },
) =>
    buildImageTree({
        clients: input.clients,
        dockerStates: input.dockerStates,
        assignment: projectAssignment(hostStates([], input.dockerStates), input.projects ?? []),
        projectId: input.projectId,
    });

const amd64 = { os: "linux", architecture: "amd64" };
const arm64 = { os: "linux", architecture: "arm64" };

describe("buildImageTree", () => {
    it("puts the same digest on two hosts into one row", () => {
        const [repo, ...rest] = tree({
            clients: [client("h1"), client("h2")],
            dockerStates: {
                h1: dockerState([container()], [image({ platform: amd64 })]),
                h2: dockerState([container({ id: "c9" })], [image({ platform: amd64 })]),
            },
        });
        expect(rest).toEqual([]);
        expect(repo).toMatchObject({ id: "nginx", clientIds: ["h1", "h2"], containerIds: ["c1", "c9"] });
        expect(repo.children?.map((t) => t.id)).toEqual(["nginx:1.27"]);
        expect(repo.children?.[0].children).toHaveLength(1);
        expect(repo.children?.[0].children?.[0]).toMatchObject({
            id: "nginx:1.27@sha256:d1|linux/amd64",
            digest: "sha256:d1",
            platform: "linux/amd64",
            imageIds: ["sha256:aaa"],
            clientIds: ["h1", "h2"],
        });
    });

    it("keeps two platforms under one tag apart, even on the same digest", () => {
        const [repo] = tree({
            clients: [client("h1"), client("h2")],
            dockerStates: {
                h1: dockerState([], [image({ platform: amd64 })]),
                h2: dockerState([], [image({ id: "sha256:bbb", platform: arm64 })]),
            },
        });
        const [tag] = repo.children ?? [];
        expect(tag.platforms).toEqual(["linux/amd64", "linux/arm64"]);
        expect(repo.platforms).toEqual(["linux/amd64", "linux/arm64"]);
        expect(tag.children?.map((d) => [d.platform, d.clientIds])).toEqual([
            ["linux/amd64", ["h1"]],
            ["linux/arm64", ["h2"]],
        ]);
    });

    it("lists an image without a tag under <none>, last, and never checks it", () => {
        const result = tree({
            clients: [client("h1")],
            dockerStates: {
                h1: dockerState(
                    [container({ imageId: "sha256:old" }), container({ id: "c2", imageId: "sha256:bare" })],
                    [
                        // Left behind by a pull: the digest is known, the tag has moved on.
                        image({ id: "sha256:old", repoTags: [] }),
                        image({ id: "sha256:bare", repoTags: [], repoDigests: [] }),
                        image({ id: "sha256:zzz", repoTags: ["zzz:1"], repoDigests: [] }),
                    ],
                ),
            },
        });
        expect(result.map((r) => r.repository)).toEqual(["nginx", "zzz", "<none>"]);
        const [nginx, , none] = result;
        expect(nginx.children?.map((t) => t.tag)).toEqual(["<none>"]);
        expect(nginx.updateStatus).toBe("none");
        expect(none.children?.[0].children?.[0]).toMatchObject({ digest: "sha256:bare", updateStatus: "none" });
    });

    it("checks only an image a container runs", () => {
        const states = (containers: ReturnType<typeof container>[]) =>
            tree({
                clients: [client("h1")],
                dockerStates: { h1: dockerState(containers, [image({ updateCheck: check(true) })]) },
            })[0].updateStatus;
        expect(states([])).toBe("none");
        expect(states([container()])).toBe("update");
    });

    it("reads a row from every host's answer", () => {
        const status = (...checks: (ReturnType<typeof check> | undefined)[]) =>
            tree({
                clients: checks.map((_, i) => client(`h${i}`)),
                dockerStates: Object.fromEntries(
                    checks.map((updateCheck, i) => [`h${i}`, dockerState([container()], [image({ updateCheck })])]),
                ),
            })[0].updateStatus;
        expect(status(undefined)).toBe("unchecked");
        expect(status(check(false))).toBe("current");
        expect(status(check(false), check(true))).toBe("update");
        expect(status(check(false), check(false, "rate limited"))).toBe("current");
        expect(status(check(false, "rate limited"))).toBe("unchecked");
    });

    it("skips a client whose Docker state has not arrived", () => {
        expect(tree({ clients: [client("h1")], dockerStates: {} })).toEqual([]);
    });

    it("narrows to a project's images, and still counts every container on them", () => {
        const input = {
            clients: [client("h1")],
            dockerStates: {
                h1: dockerState(
                    [
                        container(),
                        container({ id: "c2", names: ["/other"] }),
                        container({ id: "c3", names: ["/db"], imageId: "sha256:pg", configImage: "postgres:17" }),
                    ],
                    [image(), image({ id: "sha256:pg", repoTags: ["postgres:17"], repoDigests: ["postgres@sha256:p1"] })],
                ),
            },
            projects: [project("a", "web")],
        };
        expect(tree(input).map((r) => r.repository)).toEqual(["nginx", "postgres"]);
        const narrowed = tree({ ...input, projectId: "a" });
        expect(narrowed.map((r) => r.repository)).toEqual(["nginx"]);
        // The container outside the project still uses the image: it must not look prunable.
        expect(narrowed[0].containerIds).toEqual(["c1", "c2"]);
    });
});
