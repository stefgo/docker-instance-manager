import { useCallback, useMemo } from "react";
import { Download, Layers, RefreshCw } from "lucide-react";
import { DockerContainer, DockerImageUpdateCheck } from "@dim/shared";
import {
    Button,
    DataAction,
    DataMultiView,
    DataTableDef,
    useConfirm,
} from "@stefgo/react-ui-components";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { aggregateUpdateStatus, UpdateStatus } from "../../images/hooks/useImagesData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { describePull } from "../../images/confirmations";
import { StatusDot } from "../../clients/components/StatusDot";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { clientName as nameOf } from "../../../utils";

/**
 * What a check and a pull need, on either kind of row: the reference to ask the registry
 * about, the hosts to ask it on, and the digests a check is keyed by. A container row
 * carries the one host it runs on, an image row every host the project runs it on.
 */
interface Updatable {
    /** What the containers were configured with, and what a pull asks for: `repository:tag`. */
    imageRef: string;
    clientIds: string[];
    repoDigests: string[];
    updateStatus: UpdateStatus;
}

interface ImageRow extends Updatable {
    id: string;
    nodeType: "image";
    containerCount: number;
    children: ContainerRow[];
}

interface ContainerRow extends Updatable {
    id: string;
    nodeType: "container";
    clientId: string;
    clientName: string;
    name: string;
    state: string;
    status: string;
    /** The image this container runs from, which a moving tag may no longer point at. */
    imageId: string;
    /**
     * The manifest digest of that image, or null for an image no registry served. Unlike the
     * image id -- a local config digest, which a multi-arch image has one of per platform --
     * this is the same string on every host that pulled the same image, so two containers
     * carrying it run the identical image no matter where they run.
     */
    digest: string | null;
}

type Row = ImageRow | ContainerRow;

// The same dots the fleet-wide container list draws, so a stopped container looks the same
// on both pages. `running` is not in here: StatusDot draws the live state itself.
const STATE_DOT: Record<string, string> = {
    paused: "bg-warning",
    restarting: "bg-info animate-pulse",
    dead: "bg-error",
    created: "bg-accent",
};

const containerName = (c: DockerContainer): string => c.names[0]?.replace(/^\//, "") ?? c.id;

/** A digest or image id the way Docker prints it: twelve hex characters, no algorithm. */
const shortId = (id: string): string => id.replace(/^sha256:/, "").slice(0, 12);

/** A digest that a check is keyed by, whether it arrives as `repo@sha256:…` or bare. */
const toDigest = (d: string) => (d.includes("@") ? d.slice(d.indexOf("@") + 1) : d);

/** The status of one host's copy of an image. `checks` are its recorded update checks. */
function statusOf(checks: DockerImageUpdateCheck[], canCheck: boolean): UpdateStatus {
    if (!canCheck) return "none";
    if (checks.length === 0) return "unchecked";
    if (checks.some((c) => c.hasUpdate)) return "update";
    if (checks.every((c) => !!c.error)) return "unchecked";
    return "current";
}

interface ProjectImagesProps {
    projectId: string;
    searchParamKey?: string;
}

/**
 * The images a project runs on, each with the containers of this project built from it.
 *
 * Unlike the fleet-wide image list, a row here is the reference a container was configured
 * with (`repository:tag`) rather than a repository with its tags and digests: that reference
 * is what an update pulls, and what the project's auto-update acts on. The rows come from
 * the same membership the header counts, so a container that starts or stops matching the
 * query moves between images here without anything being fetched again.
 */
export const ProjectImages = ({ projectId, searchParamKey = "search.images" }: ProjectImagesProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const clients = useClientStore((s) => s.clients);
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const updateImage = useDockerStore((s) => s.updateImage);
    const imageUpdateStatus = useDockerStore((s) => s.imageUpdateStatus);
    const members = useAllProjectMembers();
    const { confirm } = useConfirm();

    const live = members.get(projectId) ?? EMPTY_MEMBERS;

    const rows: ImageRow[] = useMemo(() => {
        const clientById = new Map(clients.map((c) => [c.id, c]));
        const byRef = new Map<
            string,
            {
                clientIds: Set<string>;
                repoDigests: Set<string>;
                statuses: UpdateStatus[];
                children: ContainerRow[];
            }
        >();

        for (const { clientId, containers } of live.perClient) {
            const client = clientById.get(clientId);
            const clientName = client ? nameOf(client) : clientId;
            const images = dockerStates[clientId]?.images ?? [];
            const digestById = new Map(
                images.map((img) => [
                    img.id.startsWith("sha256:") ? img.id : `sha256:${img.id}`,
                    img.repoDigests[0] ? toDigest(img.repoDigests[0]) : null,
                ]),
            );
            // The host's copy of a reference, resolved once per host rather than once per
            // container: several containers of a project often run from the same image.
            const perRef = new Map<string, { repoDigests: string[]; status: UpdateStatus }>();

            for (const container of containers) {
                const ref = container.configImage ?? container.image;
                if (!ref) continue;

                let copy = perRef.get(ref);
                if (!copy) {
                    const image = images.find((img) => img.repoTags.includes(ref));
                    copy = {
                        repoDigests: image?.repoDigests ?? [],
                        status: statusOf(
                            image?.updateCheck ? [image.updateCheck] : [],
                            ref.includes(":"),
                        ),
                    };
                    perRef.set(ref, copy);
                }

                let entry = byRef.get(ref);
                if (!entry) {
                    entry = {
                        clientIds: new Set(),
                        repoDigests: new Set(),
                        statuses: [],
                        children: [],
                    };
                    byRef.set(ref, entry);
                }
                if (!entry.clientIds.has(clientId)) {
                    entry.clientIds.add(clientId);
                    for (const rd of copy.repoDigests) entry.repoDigests.add(rd);
                    entry.statuses.push(copy.status);
                }

                const imageId = container.imageId.startsWith("sha256:")
                    ? container.imageId
                    : `sha256:${container.imageId}`;

                entry.children.push({
                    id: `${clientId}/${container.id}`,
                    nodeType: "container",
                    clientId,
                    clientName,
                    name: containerName(container),
                    state: container.state,
                    status: container.status,
                    imageId,
                    digest: digestById.get(imageId) ?? null,
                    imageRef: ref,
                    clientIds: [clientId],
                    repoDigests: copy.repoDigests,
                    updateStatus: copy.status,
                });
            }
        }

        return Array.from(byRef.entries())
            .map(([imageRef, entry]): ImageRow => ({
                id: imageRef,
                nodeType: "image",
                imageRef,
                clientIds: Array.from(entry.clientIds),
                repoDigests: Array.from(entry.repoDigests),
                updateStatus: aggregateUpdateStatus(entry.statuses),
                containerCount: entry.children.length,
                children: entry.children.sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => a.imageRef.localeCompare(b.imageRef));
    }, [live, clients, dockerStates]);

    // An image stays in the list while one of its containers matches, so a search for a
    // container name still shows the image it runs on.
    const filtered = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows
            .map((image) => {
                if (image.imageRef.toLowerCase().includes(q)) return image;
                const children = image.children.filter(
                    (c) =>
                        c.name.toLowerCase().includes(q) ||
                        c.clientName.toLowerCase().includes(q) ||
                        shortId(c.digest ?? c.imageId).includes(q),
                );
                return children.length > 0 ? { ...image, children } : null;
            })
            .filter((image): image is ImageRow => image !== null);
    }, [rows, searchQuery]);

    const getChildren = useCallback(
        (row: Row) => (row.nodeType === "image" ? row.children : null),
        [],
    );

    const isChecking = useCallback(
        (row: Updatable) =>
            row.repoDigests.length > 0
                ? row.repoDigests.some((d) => !!checkingImages[toDigest(d)])
                : !!checkingImages[row.imageRef],
        [checkingImages],
    );

    const isUpdating = useCallback(
        (row: Updatable) => row.clientIds.some((id) => !!imageUpdateStatus[`${id}::${row.imageRef}`]),
        [imageUpdateStatus],
    );

    const check = useCallback(
        (row: Updatable) => checkImageUpdate(row.imageRef, row.repoDigests),
        [checkImageUpdate],
    );

    // The pull's progress shows in the Update column, so the dialog closes right away
    // instead of waiting for it.
    const pull = useCallback(
        async (row: Updatable) => {
            if (await confirm(describePull([row]))) updateImage(row.imageRef, row.clientIds);
        },
        [confirm, updateImage],
    );

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const checkAll = useCallback(() => {
        for (const row of rows) {
            if (row.updateStatus !== "none") check(row);
        }
    }, [rows, check]);

    const columns: DataTableDef<Row>[] = useMemo(
        () => [
            {
                tableHeader: "Image / Container",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "image" ? row.imageRef : row.name),
                tableItemRender: (row: Row) =>
                    row.nodeType === "image" ? (
                        <span className="text-sm font-medium">{row.imageRef}</span>
                    ) : (
                        <div className="flex items-center gap-2">
                            <StatusDot
                                online={row.state === "running"}
                                idleClassName={STATE_DOT[row.state]}
                            />
                            <span className="text-sm text-text-muted">{row.name}</span>
                        </div>
                    ),
            },
            {
                tableHeader: "Client",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "container" ? row.clientName : ""),
                tableItemRender: (row: Row) =>
                    row.nodeType === "container" ? (
                        <span className="text-sm text-text-muted">{row.clientName}</span>
                    ) : null,
            },
            {
                // Which image a container actually runs from: a tag moves, a digest does not.
                // Two containers showing the same one run the identical image, on whatever
                // host -- which is why this is the digest and not the local image id.
                tableHeader: "Digest",
                sortable: true,
                sortValue: (row: Row) =>
                    row.nodeType === "container" ? shortId(row.digest ?? row.imageId) : "",
                tableItemRender: (row: Row) =>
                    row.nodeType === "container" ? (
                        <span
                            className="font-mono text-xs text-text-muted"
                            title={row.digest ?? `Built locally, image ${shortId(row.imageId)}`}
                        >
                            {row.digest ? shortId(row.digest) : `${shortId(row.imageId)} (local)`}
                        </span>
                    ) : null,
            },
            {
                tableHeader: "Containers",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "image" ? row.containerCount : 0),
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (row: Row) =>
                    row.nodeType === "image" ? (
                        <span>{row.containerCount}</span>
                    ) : (
                        <span className="text-text-muted">{row.status}</span>
                    ),
            },
            {
                // A container row reports its own host's copy; the image row above it the
                // worst of them, so a single host that is behind is visible while collapsed.
                tableHeader: "Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (row: Row) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={row.updateStatus}
                            isChecking={isChecking(row)}
                            isUpdating={isUpdating(row)}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Actions",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (row: Row) => {
                    // The same two actions on both levels -- on an image row they act on every
                    // host the project runs it on, on a container row only on its own host.
                    const checking = isChecking(row);
                    const updating = isUpdating(row);
                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction
                                rowId={row.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => check(row),
                                        tooltip: {
                                            enabled: "Check for Update",
                                            disabled: checking ? "Checking…" : "This image cannot be checked",
                                        },
                                        color: "blue",
                                        disabled: row.updateStatus === "none" || checking,
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => pull(row),
                                        tooltip: {
                                            enabled: "Pull & Recreate",
                                            disabled: updating ? "Pulling…" : "No update available",
                                        },
                                        color: "green",
                                        disabled: row.updateStatus !== "update" || updating,
                                    },
                                ]}
                            />
                        </div>
                    );
                },
            },
        ],
        [isChecking, isUpdating, check, pull],
    );

    return (
        <DataMultiView<Row>
            title={
                <>
                    <Layers size={18} className="text-text-muted" /> Images
                </>
            }
            extraActions={
                <Button
                    size="sm"
                    icon={RefreshCw}
                    onClick={checkAll}
                    disabled={isAnyChecking || rows.length === 0}
                    classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                >
                    Check
                </Button>
            }
            data={filtered}
            keyField="id"
            // `tableDef` plus `getChildren` is what puts the view into its tree mode -- the
            // hierarchy is the point of this tab, so no view toggle is offered.
            tableDef={columns}
            getChildren={getChildren}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search images and containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No container of this project is running anywhere, so it uses no image."
            pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
            className="h-full"
        />
    );
};
