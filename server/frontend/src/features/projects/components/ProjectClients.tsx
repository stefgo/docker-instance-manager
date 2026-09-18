import { useCallback, useMemo } from "react";
import { Download, Monitor, RefreshCw } from "lucide-react";
import { CLIENT_STATUS, DockerContainer, DockerImageUpdateCheck } from "@dim/shared";
import { Button, DataAction, DataMultiView, DataTableDef, useConfirm } from "@stefgo/react-ui-components";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { aggregateUpdateStatus, UpdateStatus } from "../../images/hooks/useImagesData";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { describePull } from "../../images/confirmations";
import { StatusDot } from "../../clients/components/StatusDot";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { clientName } from "../../../utils";

// Module scope, not inside the component: the same table the fleet-wide container list
// draws its dots from, so a stopped container looks the same on both pages.
// `running` is not in here: StatusDot draws the live state itself.
const STATE_DOT: Record<string, string> = {
    paused: "bg-warning",
    restarting: "bg-info animate-pulse",
    dead: "bg-error",
    created: "bg-accent",
};

/**
 * One reference a check or a pull acts on: what to ask the registry about, the hosts to
 * ask it on, and the digests a check is keyed by. A container row has exactly one; a host
 * row one per distinct reference its containers were configured with, all on that host.
 */
interface Updatable {
    /** What the containers were configured with, and what a pull asks for: `repository:tag`. */
    imageRef: string;
    clientIds: string[];
    repoDigests: string[];
}

/** What both kinds of row share: what the Update column shows and the actions act on. */
interface Updatables {
    updatables: Updatable[];
    updateStatus: UpdateStatus;
}

interface HostRow extends Updatables {
    id: string;
    nodeType: "host";
    clientId: string;
    clientName: string;
    online: boolean;
    containerCount: number;
    children: ContainerRow[];
}

interface ContainerRow extends Updatables {
    id: string;
    nodeType: "container";
    name: string;
    image: string;
    state: string;
    status: string;
}

type Row = HostRow | ContainerRow;

const containerName = (c: DockerContainer): string =>
    c.names[0]?.replace(/^\//, "") ?? c.id;

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

interface ProjectClientsProps {
    projectId: string;
    searchParamKey?: string;
}

/**
 * The hosts a project runs on, each with the containers of this project on it.
 *
 * The other two tabs group by container and by image, which is what a project is *updated*
 * by; this one groups by host, which is where it actually runs. The rows come from the same
 * membership the header counts, so a container that starts or stops matching the query
 * moves between hosts here without anything being fetched again.
 */
export const ProjectClients = ({ projectId, searchParamKey = "search.clients" }: ProjectClientsProps) => {
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

    const rows: HostRow[] = useMemo(() => {
        const clientById = new Map(clients.map((c) => [c.id, c]));
        return live.perClient
            .map(({ clientId, containers }) => {
                const client = clientById.get(clientId);
                const images = dockerStates[clientId]?.images ?? [];
                // The host's copy of a reference, resolved once per host rather than once
                // per container: several containers of a project often run the same image.
                const perRef = new Map<string, { updatable: Updatable; status: UpdateStatus }>();

                const children: ContainerRow[] = containers
                    .map((c) => {
                        const ref = c.configImage ?? c.image;
                        let copy = perRef.get(ref);
                        if (!copy) {
                            const image = images.find((img) => img.repoTags.includes(ref));
                            copy = {
                                updatable: {
                                    imageRef: ref,
                                    clientIds: [clientId],
                                    repoDigests: image?.repoDigests ?? [],
                                },
                                status: statusOf(
                                    image?.updateCheck ? [image.updateCheck] : [],
                                    ref.includes(":"),
                                ),
                            };
                            perRef.set(ref, copy);
                        }

                        return {
                            id: `${clientId}/${c.id}`,
                            nodeType: "container" as const,
                            name: containerName(c),
                            image: ref,
                            state: c.state,
                            status: c.status,
                            updatables: [copy.updatable],
                            updateStatus: copy.status,
                        };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));

                const copies = Array.from(perRef.values());

                return {
                    id: clientId,
                    nodeType: "host" as const,
                    clientId,
                    clientName: client ? clientName(client) : clientId,
                    online: client?.status === CLIENT_STATUS.ONLINE,
                    containerCount: children.length,
                    children,
                    // Every reference this host runs the project from, so a check or a pull
                    // on the host row covers all of them -- but only on this one host.
                    updatables: copies.map((c) => c.updatable),
                    updateStatus: aggregateUpdateStatus(copies.map((c) => c.status)),
                };
            })
            .sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [live, clients, dockerStates]);

    // A host stays in the list while one of its containers matches, so a search for a
    // container name still shows the host it runs on.
    const filtered = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows
            .map((host) => {
                if (host.clientName.toLowerCase().includes(q)) return host;
                const children = host.children.filter(
                    (c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
                );
                return children.length > 0 ? { ...host, children } : null;
            })
            .filter((host): host is HostRow => host !== null);
    }, [rows, searchQuery]);

    const getChildren = useCallback(
        (row: Row) => (row.nodeType === "host" ? row.children : null),
        [],
    );

    const isChecking = useCallback(
        (row: Updatables) =>
            row.updatables.some((u) =>
                u.repoDigests.length > 0
                    ? u.repoDigests.some((d) => !!checkingImages[toDigest(d)])
                    : !!checkingImages[u.imageRef],
            ),
        [checkingImages],
    );

    const isUpdating = useCallback(
        (row: Updatables) =>
            row.updatables.some((u) =>
                u.clientIds.some((id) => !!imageUpdateStatus[`${id}::${u.imageRef}`]),
            ),
        [imageUpdateStatus],
    );

    const check = useCallback(
        (row: Updatables) => {
            for (const u of row.updatables) checkImageUpdate(u.imageRef, u.repoDigests);
        },
        [checkImageUpdate],
    );

    // The pull's progress shows in the Update column, so the dialog closes right away
    // instead of waiting for it.
    const pull = useCallback(
        async (row: Updatables) => {
            if (!(await confirm(describePull(row.updatables)))) return;
            for (const u of row.updatables) updateImage(u.imageRef, u.clientIds);
        },
        [confirm, updateImage],
    );

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    // The same button the images tab carries: one check over every reference the project
    // runs, on every host it runs on.
    const checkAll = useCallback(() => {
        for (const row of rows) {
            if (row.updateStatus !== "none") check(row);
        }
    }, [rows, check]);

    const columns: DataTableDef<Row>[] = useMemo(
        () => [
            {
                tableHeader: "Client / Container",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "host" ? row.clientName : row.name),
                tableItemRender: (row: Row) =>
                    row.nodeType === "host" ? (
                        <div className="flex items-center gap-2">
                            <StatusDot online={row.online} />
                            <span className="text-sm font-medium">{row.clientName}</span>
                        </div>
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
                tableHeader: "Image",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "container" ? row.image : ""),
                tableItemRender: (row: Row) =>
                    row.nodeType === "container" ? (
                        <span className="text-sm text-text-muted">{row.image}</span>
                    ) : null,
            },
            {
                // The same column the images tab carries: a count on the grouping row, the
                // container's own status on the rows below it.
                tableHeader: "Containers",
                sortable: true,
                sortValue: (row: Row) => (row.nodeType === "host" ? row.containerCount : 0),
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (row: Row) =>
                    row.nodeType === "host" ? (
                        <span>{row.containerCount}</span>
                    ) : (
                        <span className="text-text-muted">{row.status}</span>
                    ),
            },
            {
                // A container row reports its own host's copy of its image; the host row
                // above it the worst of the references it runs, so a host that is behind is
                // visible while collapsed.
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
                    const checking = isChecking(row);
                    const updating = isUpdating(row);
                    // The same two actions on both levels -- on a host row they cover every
                    // reference the project runs there, on a container row only its own.
                    // Starting, stopping and removing a container is what the container tab
                    // is for; this tab acts on images only.
                    const actions = [
                        {
                            icon: RefreshCw,
                            onClick: () => check(row),
                            tooltip: {
                                enabled: "Check for Update",
                                disabled: checking ? "Checking…" : "This image cannot be checked",
                            },
                            color: "blue" as const,
                            disabled: row.updateStatus === "none" || checking,
                        },
                        {
                            icon: Download,
                            onClick: () => pull(row),
                            tooltip: {
                                enabled: "Pull & Recreate",
                                disabled: updating ? "Pulling…" : "No update available",
                            },
                            color: "green" as const,
                            disabled: row.updateStatus !== "update" || updating,
                        },
                    ];

                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction rowId={row.id} actions={actions} />
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
                    <Monitor size={18} className="text-text-muted" /> Clients
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
            // `tableDef` plus `getChildren` is what puts the view into its tree mode --
            // the hierarchy is the point of this tab, so no view toggle is offered.
            tableDef={columns}
            getChildren={getChildren}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search clients and containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No containers of this project are running on any client."
            pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
            className="h-full"
        />
    );
};
