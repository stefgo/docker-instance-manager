import type { DockerImage } from "@dim/shared";
import type { EntityDetail } from "@stefgo/react-ui-components";
import { formatDate } from "../../../utils";

const OCI = "org.opencontainers.image.";

/** The label of the source detail, by which a caller moves it to the end. */
export const SOURCE = "Source";

/** The labels `ociLabelDetails` gives its details without a prefix, in its order. */
export const OCI_DETAIL_LABELS = ["Title", "Version", "Revision", "Build", SOURCE];

/**
 * The OCI labels an image sets, as details. Only the labels it sets are listed; plenty of
 * images set none, and then nothing shows. `prefix` goes in front of each label but the
 * source, which names the project rather than the build.
 *
 * The source comes last and spans every column: a caller that adds details after these moves
 * it to the end again, so it closes the card.
 */
export function ociLabelDetails(labels: Record<string, string> | null | undefined, prefix = ""): EntityDetail[] {
    if (!labels) return [];
    const version = labels[`${OCI}version`];
    const revision = labels[`${OCI}revision`];
    const created = labels[`${OCI}created`];
    const title = labels[`${OCI}title`];
    const source = labels[`${OCI}source`];
    const named = (label: string) => (prefix ? `${prefix} ${label}` : label);
    return [
        // "New Image" names the coming image; the one at hand has a title.
        ...(title ? [{ label: prefix ? named("Image") : "Title", value: title }] : []),
        ...(version ? [{ label: named("Version"), value: version, copyable: version }] : []),
        ...(revision ? [{ label: named("Revision"), value: revision.slice(0, 12), copyable: revision }] : []),
        ...(created ? [{ label: named("Build"), value: formatDate(created) }] : []),
        ...(source
            ? [{
                label: SOURCE,
                value: /^https?:\/\//.test(source)
                    ? <a href={source} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{source}</a>
                    : source,
                copyable: source,
                span: "full" as const,
            }]
            : []),
    ];
}

/** The OCI labels of the image an update would bring, as the registry reports them. */
export function remoteLabels(images: DockerImage[]): Record<string, string> | undefined {
    return images
        .map((img) => (img.updateCheck?.hasUpdate ? img.updateCheck.remoteLabels : null))
        .find((l): l is Record<string, string> => !!l && Object.keys(l).length > 0);
}

/** What the registry says about the image an update would bring, from its OCI labels. */
export function remoteImageDetails(images: DockerImage[]): EntityDetail[] {
    return ociLabelDetails(remoteLabels(images), "New");
}
