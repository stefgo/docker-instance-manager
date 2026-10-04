import { describe, expect, it } from "vitest";
import {
    containerGroupId,
    containerInstanceNodeId,
    containersFiltered,
    parseContainerGroupId,
    paths,
} from "./paths";

describe("containerGroupId", () => {
    it("is taken apart into what it was built from", () => {
        const id = containerGroupId("web", "ghcr.io/acme/web:1.2");
        expect(parseContainerGroupId(id)).toEqual({ name: "web", configImage: "ghcr.io/acme/web:1.2" });
    });

    it("keeps a container without a configured image apart from its name", () => {
        expect(parseContainerGroupId(containerGroupId("web", ""))).toEqual({ name: "web", configImage: "" });
    });

    it("reads an id without the separator as a name", () => {
        expect(parseContainerGroupId("web")).toEqual({ name: "web", configImage: "" });
    });
});

describe("paths", () => {
    it("encodes what a path segment cannot carry", () => {
        expect(paths.image("ghcr.io/acme/web:1.2")).toBe("/images/ghcr.io%2Facme%2Fweb%3A1.2");
        expect(paths.container(containerGroupId("web", "acme/web:1"))).toBe("/containers/web%7C%7Cacme%2Fweb%3A1");
    });

    it("puts an instance below the list it is opened from", () => {
        expect(paths.containerInstance("h1", "web")).toBe("/containers/instances/h1/web");
        expect(paths.imageInstance("h1", "nginx:1.27")).toBe("/images/instances/h1/nginx%3A1.27");
        expect(paths.clientImage("h1", "sha256:abc")).toBe("/clients/h1/images/sha256%3Aabc");
    });
});

describe("containerInstanceNodeId", () => {
    it("tells the rows of one group apart by their client", () => {
        const group = containerGroupId("web", "nginx:1.27");
        expect(containerInstanceNodeId(group, "h1")).not.toBe(containerInstanceNodeId(group, "h2"));
        expect(containerInstanceNodeId(group, "h1").startsWith(group)).toBe(true);
    });
});

describe("containersFiltered", () => {
    it("names the filter in the query of the container list", () => {
        expect(containersFiltered({ update: "update" })).toEqual({ pathname: "/containers", search: "?update=update" });
        expect(containersFiltered({ state: "not-running", update: "current" })).toEqual({
            pathname: "/containers",
            search: "?state=not-running&update=current",
        });
    });

    it("leaves no parameter behind for a filter that filters nothing", () => {
        expect(containersFiltered({})).toEqual({ pathname: "/containers", search: "" });
        expect(containersFiltered({ state: "all", update: "all" })).toEqual({ pathname: "/containers", search: "" });
    });
});
