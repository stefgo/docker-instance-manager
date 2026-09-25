import { Link } from "react-router-dom";
import { Box, CircleArrowUp, Layers, Monitor } from "lucide-react";
import { CONNECTION_MODE, type Client, type DockerContainer, type DockerImage } from "@dim/shared";
import { Badge, type EntityDetail, type EntityDetailGroup } from "@stefgo/react-ui-components";
import { EMPTY_VALUE, formatBytes, formatDate } from "../../utils";
import { StatusDot } from "../clients/components/StatusDot";
import { ClientLabel } from "../clients/components/ClientLabel";
import { summarizeChecks } from "../images/lib/checkSummary";
import { shortDigest, toDigest } from "../images/lib/digest";
import { OCI_DETAIL_LABELS, SOURCE, ociLabelDetails, remoteLabels } from "../images/lib/remoteImageDetails";
import type { ClientNode } from "./hooks/useContainersData";
import { AutoUpdateSourceCell } from "./components/AutoUpdateSourceCell";
import { ContainerStatus } from "./components/ContainerStatus";
import { STATE_DOT } from "./containerState";

// The icons of the navigation entries, so each group reads as the thing it is about.
const ICON = { size: 16 } as const;

/**
 * The published ports as `8080→80/tcp`, the others as `80/tcp`. Docker lists a published
 * port once per address family; the list names it once.
 */
function formatPorts(container: DockerContainer): string {
    const ports = container.ports.map((p) =>
        p.publicPort ? `${p.publicPort}→${p.privatePort}/${p.type}` : `${p.privatePort}/${p.type}`,
    );
    return [...new Set(ports)].join(", ") || EMPTY_VALUE;
}

/** The host the container runs on, as far as the page needs it to find the host again. */
export function clientGroup(node: ClientNode, client: Client | undefined): EntityDetailGroup {
    const inbound = client?.connectionMode !== CONNECTION_MODE.OUTBOUND;
    // An inbound agent comes from an address; an outbound one is reached at one.
    const address = inbound ? client?.inboundLastIp : client?.outboundTargetAddress;
    return {
        key: "client",
        title: "Client",
        leading: <Monitor {...ICON} />,
        details: [
            {
                label: "Client",
                value: (
                    <Link to={`/client/${node.clientId}`} className="hover:underline">
                        <ClientLabel name={node.clientName} online={node.clientOnline} />
                    </Link>
                ),
                visibility: "always",
            },
            { label: "Hostname", value: client?.hostname || EMPTY_VALUE, visibility: "always" },
            {
                label: inbound ? "IP" : "Target Address",
                value: address || EMPTY_VALUE,
                copyable: address || undefined,
                visibility: "always",
            },
        ],
    };
}

/** What the host reports about the container itself. */
export function containerGroup(
    node: ClientNode,
    container: DockerContainer | undefined,
    nodeState: string,
): EntityDetailGroup {
    return {
        key: "container",
        title: "Container",
        leading: <Box {...ICON} />,
        details: [
            {
                label: "Status",
                // An offline host's last snapshot is not its present.
                value: (
                    <div className="flex items-center gap-2">
                        <StatusDot online={nodeState === "running"} idleClassName={STATE_DOT[nodeState]} />
                        <span>
                            {node.clientOnline
                                ? container ? <ContainerStatus container={container} /> : node.containerState
                                : "Unknown (client offline)"}
                        </span>
                    </div>
                ),
                visibility: "always",
            },
            { label: "Container ID", value: node.containerId.slice(0, 12), copyable: node.containerId, visibility: "always" },
            ...(container
                ? [{ label: "Current Image", value: container.image, copyable: container.image, visibility: "always" as const }]
                : []),
            { label: "Auto-Update", value: <AutoUpdateSourceCell enrollment={node.autoUpdate} /> },
            ...(container
                ? [
                    // Docker counts in seconds.
                    { label: "Created", value: formatDate(container.created * 1000) },
                    { label: "Ports", value: formatPorts(container) },
                ]
                : []),
        ],
    };
}

interface ImageGroupProps {
    /** The reference the container was created from, `:latest` added where it had no tag. */
    configImage: string;
    container: DockerContainer | undefined;
    /** The host's images, the one the container runs among them. */
    images: DockerImage[];
}

/**
 * The image the container runs on its host.
 *
 * That is the image behind the container's `imageId`, not the one its tag points to now: a
 * pull without a recreate moves the tag to a newer image while the container keeps the old
 * one. Only where the host does not list the container's image does it fall back to the
 * tagged one.
 */
function resolveImage({ configImage, container, images }: ImageGroupProps) {
    const running = container ? images.find((i) => i.id === container.imageId) : undefined;
    return { running, image: running ?? images.find((i) => i.repoTags.includes(configImage)) };
}

/**
 * The OCI labels of the running image and of the one an update would bring, as details.
 *
 * Where there is an update to show, the two list the same labels in the same order, each
 * one that either image sets, with a placeholder where only the other does: the groups line
 * up row by row and read as a before and after.
 */
function labelDetails(image: DockerImage | undefined): { current: EntityDetail[]; next: EntityDetail[] } {
    const current = image ? ociLabelDetails(image.labels) : [];
    const next = image ? ociLabelDetails(remoteLabels([image])) : [];
    if (next.length === 0) return { current, next };

    const labels = OCI_DETAIL_LABELS.filter((l) => [...current, ...next].some((d) => d.label === l));
    const aligned = (details: EntityDetail[]) =>
        labels.map((label) =>
            details.find((d) => d.label === label)
                ?? { label, value: EMPTY_VALUE, ...(label === SOURCE ? { span: "full" as const } : {}) },
        );
    return { current: aligned(current), next: aligned(next) };
}

/** The image the container runs on its host (see `resolveImage`), and says when a pull superseded it. */
export function imageGroup(props: ImageGroupProps): EntityDetailGroup {
    const { configImage, container } = props;
    const { running, image } = resolveImage(props);
    // The tag has moved on to another image: the container runs what was pulled before.
    const superseded = !!running && configImage !== "" && !running.repoTags.includes(configImage);

    const check = image?.updateCheck;
    const { lastChecked, result: checkResult } = summarizeChecks(
        check ? [{ checkedAt: check.checkedAt, ...(check.error ? { error: check.error } : {}) }] : [],
    );

    // What the image says about itself; what the registry says about the next one has a
    // group of its own. The source comes last in the labels and so closes the group.
    const { current: labels } = labelDetails(image);

    const reference = configImage ? (
        <Link to={`/image/${encodeURIComponent(configImage)}`} className="hover:underline">
            {configImage}
        </Link>
    ) : (
        container?.image ?? EMPTY_VALUE
    );

    const details: EntityDetail[] = [
        { label: "Configured Image", value: reference, copyable: configImage || undefined, visibility: "always" },
        ...(image
            ? [
                { label: "Image ID", value: shortDigest(image.id), copyable: image.id, visibility: "always" as const },
                {
                    label: "Platform",
                    value: image.platform ? `${image.platform.os}/${image.platform.architecture}` : EMPTY_VALUE,
                    visibility: "always" as const,
                },
                { label: "Size", value: formatBytes(image.size) },
                { label: "Created", value: image.created ? formatDate(image.created) : EMPTY_VALUE },
                { label: "Tags", value: image.repoTags.filter((t) => t !== "<none>:<none>").join(", ") || EMPTY_VALUE },
                ...(image.repoDigests.length > 0
                    ? [{
                        label: image.repoDigests.length === 1 ? "Digest" : "Digests",
                        value: image.repoDigests.map((d) => shortDigest(toDigest(d))).join(", "),
                        ...(image.repoDigests.length === 1 ? { copyable: image.repoDigests[0] } : {}),
                    }]
                    : []),
                { label: "Last Checked", value: lastChecked },
                ...(checkResult
                    ? [{
                        label: "Check Result",
                        value: checkResult === "OK"
                            ? checkResult
                            : <span className="text-error">{checkResult}</span>,
                    }]
                    : []),
                ...labels,
            ]
            : []),
    ];

    return {
        key: "image",
        title: "Image",
        leading: <Layers {...ICON} />,
        meta: (superseded || !image) && (
            <>
                {superseded && <Badge variant="warning">Superseded by a newer pull</Badge>}
                {!image && <Badge variant="neutral">Not listed on this host</Badge>}
            </>
        ),
        details,
    };
}

/**
 * What the registry says about the image an update would bring, apart from the one the
 * container runs, so the two cannot be mistaken for each other. Empty without an update, or
 * where the registry reports no labels, and then the header leaves the group out.
 *
 * Its details mirror the running image's labels in `imageGroup`, row for row.
 */
export function newImageGroup(props: ImageGroupProps): EntityDetailGroup {
    const { next } = labelDetails(resolveImage(props).image);
    return {
        key: "newImage",
        title: "New Image",
        leading: <CircleArrowUp {...ICON} />,
        details: next,
    };
}
