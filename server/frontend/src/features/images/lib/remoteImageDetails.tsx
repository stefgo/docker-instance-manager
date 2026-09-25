import type { DockerImage } from "@dim/shared";
import type { EntityDetail } from "@stefgo/react-ui-components";
import { formatDate } from "../../../utils";

const OCI = "org.opencontainers.image.";

/** The label of the source detail, by which a caller moves it to the end. */
export const SOURCE = "Source";

/** The labels of the details `ociLabelDetails` gives, in its order. */
export const OCI_DETAIL_LABELS = ["Title", "Version", "Revision", "Build", SOURCE];

/**
 * The OCI labels an image sets, as details. Only the labels it sets are listed; plenty of
 * images set none, and then nothing shows.
 *
 * The source comes last and spans every column: a caller that adds details after these moves
 * it to the end again, so it closes the card.
 */
export function ociLabelDetails(labels: Record<string, string> | null | undefined): EntityDetail[] {
    if (!labels) return [];
    const version = labels[`${OCI}version`];
    const revision = labels[`${OCI}revision`];
    const created = labels[`${OCI}created`];
    const title = labels[`${OCI}title`];
    const source = labels[`${OCI}source`];
    return [
        ...(title ? [{ label: "Title", value: title }] : []),
        ...(version ? [{ label: "Version", value: version, copyable: version }] : []),
        ...(revision ? [{ label: "Revision", value: revision.slice(0, 12), copyable: revision }] : []),
        ...(created ? [{ label: "Build", value: formatDate(created) }] : []),
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
