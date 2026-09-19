import { useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useNow } from "../../../hooks/useNow";
import { DockerContainer, DockerActionType } from "@dim/shared";
import { Play, Square, RotateCcw, Trash2, Pause, PlayCircle, Box } from "lucide-react";
import {
    DataMultiView,
    DataTableDef,
    DataListDef,
    DataListColumnDef,
    DataAction,
} from "@stefgo/react-ui-components";
import { StatusDot } from "./StatusDot";
import { useAutoUpdateStore } from "../../../stores/useAutoUpdateStore";
import { resolveAutoUpdate } from "../../containers/autoUpdate";
import {
    containerKey,
    hostHasSchedule,
    useProjectAssignment,
} from "../../projects/hooks/useProjectMembers";
import { useClientStore } from "../../../stores/useClientStore";
import { AutoUpdateSourceCell } from "../../containers/components/AutoUpdateSourceCell";
import { STATE_DOT, containerStatus } from "../../containers/containerState";
import { ContainerStatus } from "../../containers/components/ContainerStatus";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";

interface ClientContainerListProps {
    clientId: string;
    containers: DockerContainer[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ClientContainerList = ({ clientId, containers, onAction, searchParamKey = "search" }: ClientContainerListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const labelFilter = useAutoUpdateStore((s) => s.labelFilter);
    const assignment = useProjectAssignment();
    const hostSchedule = hostHasSchedule(useClientStore((s) => s.clients.find((cl) => cl.id === clientId)));

    const enrollmentOf = (c: DockerContainer) =>
        resolveAutoUpdate(c, labelFilter, assignment.get(containerKey(clientId, c.id)), hostSchedule);

    const sortedContainers = useMemo(
        () => [...containers].sort((a, b) => (a.names[0]?.replace(/^\//, "") ?? a.id).localeCompare(b.names[0]?.replace(/^\//, "") ?? b.id)),
        [containers],
    );

    // The search matches the status as shown, so it reads the same clock the cells do.
    const now = useNow();
    const filteredContainers = useMemo(() => {
        if (!searchQuery) return sortedContainers;
        const q = searchQuery.toLowerCase();
        return sortedContainers.filter(c =>
            c.names.some(n => n.replace(/^\//, "").toLowerCase().includes(q)) ||
            c.image.toLowerCase().includes(q) ||
            containerStatus(c, now).toLowerCase().includes(q),
        );
    }, [sortedContainers, searchQuery, now]);

    const buildMenuEntries = (c: DockerContainer) => {
        const entries = [];
        const isRunning = c.state === "running";
        const isPaused = c.state === "paused";

        if (!isRunning && !isPaused) {
            entries.push({ label: "Start", icon: Play, onClick: () => onAction("container:start", c.id), variant: "default" as const });
        }
        if (isRunning) {
            entries.push({ label: "Stop", icon: Square, onClick: () => onAction("container:stop", c.id), variant: "default" as const });
            entries.push({ label: "Pause", icon: Pause, onClick: () => onAction("container:pause", c.id), variant: "default" as const });
            entries.push({ label: "Restart", icon: RotateCcw, onClick: () => onAction("container:restart", c.id), variant: "default" as const });
        }
        if (isPaused) {
            entries.push({ label: "Resume", icon: PlayCircle, onClick: () => onAction("container:unpause", c.id), variant: "default" as const });
        }
        entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("container:remove", c.id), variant: "danger" as const });
        return entries;
    };

    const tableDef: DataTableDef<DockerContainer>[] = [
        {
            tableHeader: "Name",
            sortable: true,
            sortValue: (c) => c.names[0]?.replace(/^\//, "") ?? c.id,
            tableItemRender: (c) => {
                const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
                return (
                    <div className="flex items-center gap-2">
                        <StatusDot online={c.state === "running"} idleClassName={STATE_DOT[c.state]} />
                        <span className="text-sm">{name}</span>
                    </div>
                );
            },
        },
        {
            tableHeader: "Configured Image",
            sortable: true,
            sortValue: (c) => c.configImage ?? "",
            tableCellClassName: "text-sm max-w-[200px] truncate",
            tableItemRender: (c) => <span>{c.configImage}</span>,
        },
        {
            tableHeader: "Status",
            sortable: true,
            // By state: the text carries a duration that moves on while the list stands.
            sortValue: (c) => c.state,
            tableCellClassName: "text-text-muted text-sm",
            tableItemRender: (c) => <ContainerStatus container={c} />,
        },
        {
            tableHeader: "Ports",
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (c) => {
                const ports = Array.from(
                    new Map(
                        c.ports.filter((p) => p.publicPort).map((p) => [`${p.publicPort}→${p.privatePort}/${p.type}`, p]),
                    ).values(),
                ).map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`);
                if (ports.length === 0) return <>–</>;
                return (
                    <div className="flex flex-wrap gap-y-0.5">
                        {ports.map((p, i) => (
                            <span key={p}>{p}{i < ports.length - 1 ? ", " : ""}</span>
                        ))}
                    </div>
                );
            },
        },
        {
            tableHeader: "Auto-Update",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center",
            tableItemRender: (c) => (
                <div className="flex justify-center">
                    <AutoUpdateSourceCell enrollment={enrollmentOf(c)} />
                </div>
            ),
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (c) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={c.id}
                        menuEntries={buildMenuEntries(c)}
                    />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<DockerContainer>[] = [
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (c) => {
                        const name = c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
                        return (
                            <div className="flex items-center gap-2 py-1">
                                <StatusDot online={c.state === "running"} idleClassName={STATE_DOT[c.state]} />
                                <span className="font-medium text-text-primary">{name}</span>
                            </div>
                        );
                    },
                },
                {
                    listLabel: "Configured Image",
                    listItemRender: (c) => <span className="text-sm">{c.configImage}</span>,
                },
                {
                    listLabel: "Current Image",
                    listItemRender: (c) => <span className="text-sm">{c.image}</span>,
                },
                {
                    listLabel: "Status",
                    listItemRender: (c) => <span className="text-sm"><ContainerStatus container={c} /></span>,
                },
                {
                    listLabel: "Ports",
                    listItemRender: (c) => (
                        <span className="text-sm">
                            {c.ports.filter((p) => p.publicPort).map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`).join(", ") || "–"}
                        </span>
                    ),
                },
                {
                    listLabel: "Auto-Update",
                    listItemRender: (c) => <AutoUpdateSourceCell enrollment={enrollmentOf(c)} />,
                                }],
        },
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (c) => (
                        <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                            <DataAction
                                rowId={c.id}
                                menuEntries={buildMenuEntries(c)}
                            />
                        </div>
                    ),
                },
            ] satisfies DataListDef<DockerContainer>[],
            columnClassName: "md:text-right",
        },
    ];

    return (
        <DataMultiView
            title={<><Box size={18} className="text-text-muted" /> Containers</>}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: "dockerContainerViewMode", scope: "local" } }}
            data={filteredContainers}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No containers found."
            pagination={pagination(PAGE_SIZE.embedded)}
        />
    );
};
