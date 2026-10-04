import { describe, expect, it } from "vitest";
import { breadcrumb, parentCrumb, type CrumbResolver } from "./breadcrumb";
import type { TitleSubject } from "./pageTitle";

const resolver = (
    names: Partial<Record<TitleSubject, string>> = {},
    pages: Partial<Record<TitleSubject, string>> = {},
): CrumbResolver => ({
    nameOf: (subject) => names[subject],
    pathOf: (subject) => pages[subject],
});

const shell = { pathname: "/" };
const clients = { pathname: "/clients", handle: { nav: { label: "Clients" } } };
const containers = { pathname: "/containers", handle: { nav: { label: "Containers" } } };

describe("breadcrumb", () => {
    it("is empty on a list, which has nothing above it", () => {
        expect(breadcrumb([shell, clients, { pathname: "/clients/" }], resolver())).toEqual([]);
    });

    it("is empty outside every area", () => {
        expect(breadcrumb([shell, { pathname: "/nowhere", handle: { title: "Not Found" } }], resolver())).toEqual([]);
    });

    it("leads from the area to the subject, which is the open page and no link", () => {
        const matches = [
            shell,
            clients,
            { pathname: "/clients/a", handle: { subject: "client" as const } },
            { pathname: "/clients/a/" },
        ];
        expect(breadcrumb(matches, resolver({ client: "web01" }))).toEqual([
            { label: "Clients", to: "/clients" },
            { label: "web01" },
        ]);
    });

    it("links every route above a form", () => {
        const matches = [
            shell,
            clients,
            { pathname: "/clients/a", handle: { subject: "client" as const } },
            { pathname: "/clients/a/edit", handle: { title: "Edit" } },
        ];
        expect(breadcrumb(matches, resolver({ client: "web01" }))).toEqual([
            { label: "Clients", to: "/clients" },
            { label: "web01", to: "/clients/a" },
            { label: "Edit" },
        ]);
    });

    it("calls a subject by its title until it has a name, and leaves it out without either", () => {
        const project = { pathname: "/projects/7", handle: { subject: "project" as const, title: "Project" } };
        const projects = { pathname: "/projects", handle: { nav: { label: "Projects" } } };
        expect(breadcrumb([shell, projects, project], resolver())).toEqual([
            { label: "Projects", to: "/projects" },
            { label: "Project" },
        ]);

        const client = { pathname: "/clients/a", handle: { subject: "client" as const } };
        expect(breadcrumb([shell, clients, client], resolver())).toEqual([]);
    });

    describe("on a route that shows one host of its subject", () => {
        const instance = {
            pathname: "/containers/instances/a/authelia",
            handle: { subject: "container" as const, onHost: true },
        };

        it("names the subject across all hosts, then the host", () => {
            const names = { container: "authelia", client: "auth.internal" };
            const pages = { container: "/containers/authelia%7C%7Cauthelia%3A4" };
            expect(breadcrumb([shell, containers, instance], resolver(names, pages))).toEqual([
                { label: "Containers", to: "/containers" },
                { label: "authelia", to: "/containers/authelia%7C%7Cauthelia%3A4" },
                { label: "auth.internal" },
            ]);
        });

        it("names the subject without a link while its page is not known", () => {
            const names = { container: "authelia", client: "auth.internal" };
            expect(breadcrumb([shell, containers, instance], resolver(names))).toEqual([
                { label: "Containers", to: "/containers" },
                { label: "authelia" },
                { label: "auth.internal" },
            ]);
        });

        it("ends at the subject until the host has a name", () => {
            const trail = breadcrumb(
                [shell, containers, instance],
                resolver({ container: "authelia" }, { container: "/containers/x" }),
            );
            expect(trail).toEqual([{ label: "Containers", to: "/containers" }, { label: "authelia" }]);
        });
    });
});

describe("parentCrumb", () => {
    it("is the link before the open page", () => {
        const trail = [{ label: "Clients", to: "/clients" }, { label: "web01", to: "/clients/a" }, { label: "Edit" }];
        expect(parentCrumb(trail)).toEqual({ label: "web01", to: "/clients/a" });
    });

    it("looks past a link that leads nowhere", () => {
        const trail = [{ label: "Containers", to: "/containers" }, { label: "authelia" }, { label: "auth.internal" }];
        expect(parentCrumb(trail)).toEqual({ label: "Containers", to: "/containers" });
    });

    it("is nothing without a trail", () => {
        expect(parentCrumb([])).toBeUndefined();
    });
});
