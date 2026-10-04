import { describe, expect, it } from "vitest";
import { pageTitle, routeTitle, type TitleSubject } from "./pageTitle";

const names = (known: Partial<Record<TitleSubject, string>>) => (subject: TitleSubject) => known[subject];

describe("pageTitle", () => {
    it("ends in the name of the application", () => {
        expect(pageTitle(["web01", "Clients"])).toBe("web01 · Clients · DIM");
    });

    it("is the name of the application alone when nothing names the page", () => {
        expect(pageTitle([])).toBe("DIM");
    });

    it("leaves out a part that is missing", () => {
        expect(pageTitle([undefined, "Clients", null, ""])).toBe("Clients · DIM");
    });
});

describe("routeTitle", () => {
    const area = { nav: { label: "Clients" } };

    it("names the area on its list", () => {
        expect(routeTitle([area, undefined], names({}))).toBe("Clients · DIM");
    });

    it("puts the subject in front of its area", () => {
        expect(routeTitle([area, { subject: "client" }, undefined], names({ client: "web01" }))).toBe(
            "web01 · Clients · DIM",
        );
    });

    it("puts a route below the subject in front of it", () => {
        expect(routeTitle([area, { subject: "client" }, { title: "Edit" }], names({ client: "web01" }))).toBe(
            "Edit · web01 · Clients · DIM",
        );
    });

    it("calls a route by its subject rather than its title once the subject has a name", () => {
        const handles = [area, { subject: "client" as const }, { subject: "image" as const, title: "Image" }];
        expect(routeTitle(handles, names({ client: "web01", image: "nginx:1.27" }))).toBe(
            "nginx:1.27 · web01 · Clients · DIM",
        );
        expect(routeTitle(handles, names({ client: "web01" }))).toBe("Image · web01 · Clients · DIM");
    });

    it("leaves out a subject that has neither a name nor a title", () => {
        expect(routeTitle([area, { subject: "client" }], names({}))).toBe("Clients · DIM");
    });

    it("is the name of the application outside every area", () => {
        expect(routeTitle([undefined], names({}))).toBe("DIM");
    });
});
