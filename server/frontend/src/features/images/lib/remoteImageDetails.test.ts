import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import type { DockerImage } from "@dim/shared";
import { formatDate } from "../../../utils";
import { OCI_DETAIL_LABELS, SOURCE, ociLabelDetails, remoteLabels } from "./remoteImageDetails";

const OCI = "org.opencontainers.image.";

const image = (updateCheck?: DockerImage["updateCheck"]): DockerImage => ({
    id: "sha256:img",
    parentId: "",
    repoTags: ["nginx:1.27"],
    repoDigests: ["nginx@sha256:abc"],
    created: 0,
    size: 0,
    labels: null,
    updateCheck,
});

const check = (hasUpdate: boolean, labels?: Record<string, string> | null) => ({
    hasUpdate,
    remoteDigest: "sha256:def",
    checkedAt: "2026-10-03T12:00:00.000Z",
    remoteLabels: labels,
});

describe("ociLabelDetails", () => {
    it("shows nothing for an image that sets no labels", () => {
        expect(ociLabelDetails(null)).toEqual([]);
        expect(ociLabelDetails(undefined)).toEqual([]);
        expect(ociLabelDetails({ maintainer: "someone" })).toEqual([]);
    });

    it("lists the labels an image sets, in the announced order", () => {
        const details = ociLabelDetails({
            [`${OCI}source`]: "https://example.org/repo",
            [`${OCI}created`]: "2026-10-03T12:00:00Z",
            [`${OCI}revision`]: "0123456789abcdef0123",
            [`${OCI}version`]: "1.27.0",
            [`${OCI}title`]: "nginx",
        });
        expect(details.map((d) => d.label)).toEqual(OCI_DETAIL_LABELS);
    });

    it("shortens the revision but copies it whole", () => {
        expect(ociLabelDetails({ [`${OCI}revision`]: "0123456789abcdef0123" })).toEqual([
            { label: "Revision", value: "0123456789ab", copyable: "0123456789abcdef0123" },
        ]);
    });

    it("formats the build date", () => {
        const created = "2026-10-03T12:00:00Z";
        expect(ociLabelDetails({ [`${OCI}created`]: created })).toEqual([
            { label: "Build", value: formatDate(created) },
        ]);
    });

    it("links a source that is a web address, across every column", () => {
        const [source] = ociLabelDetails({ [`${OCI}source`]: "https://example.org/repo" });
        expect(source).toMatchObject({ label: SOURCE, copyable: "https://example.org/repo", span: "full" });
        expect(isValidElement(source.value)).toBe(true);
    });

    it("writes any other source as text, never as a link", () => {
        const [source] = ociLabelDetails({ [`${OCI}source`]: "javascript:alert(1)" });
        expect(source.value).toBe("javascript:alert(1)");
    });
});

describe("remoteLabels", () => {
    const labels = { [`${OCI}version`]: "1.28.0" };

    it("is the labels of the image an update would bring", () => {
        expect(remoteLabels([image(check(true, labels))])).toBe(labels);
    });

    it("skips images without an update, even where labels were kept", () => {
        expect(remoteLabels([image(check(false, labels))])).toBeUndefined();
        expect(remoteLabels([image(check(false, { old: "x" })), image(check(true, labels))])).toBe(labels);
    });

    it("skips an update whose labels are missing or empty", () => {
        expect(remoteLabels([image(check(true, null)), image(check(true, {})), image()])).toBeUndefined();
    });
});
