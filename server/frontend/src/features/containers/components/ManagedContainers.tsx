import { useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Box, RefreshCw, Download } from "lucide-react";
import {
    Button,
    DataAction,
    DataMultiView,
    DataTableDef,
    Select,
    StatusDot,
} from "@stefgo/react-ui-components";
import { ContainerTreeNode } from "../lib/containerGroups";
import { filterContainers, parseStateFilter, parseUpdateFilter } from "../lib/filterContainers";
import { useContainersData } from "../hooks/useContainersData";
import { containerMenuEntries, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { stateDot, containerPath, getNodeState } from "../containerState";
import { hasAutoUpdateSource } from "../autoUpdate";
import { AutoUpdateSourceCell } from "./AutoUpdateSourceCell";
import { ProjectPullButton } from "../../projects/components/ProjectPullButton";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import {
    CONTAINER_FILTER_PARAMS,
    type ContainerStateFilter,
    type ContainerUpdateFilter,
} from "../../../lib/paths";
import { updateStatusPriority } from "../../images/lib/updateStatus";

const STATE_OPTIONS: { value: ContainerStateFilter; label: string }[] = [
    { value: "all", label: "any state" },
    { value: "running", label: "running" },
    { value: "not-running", label: "not running" },
    { value: "unknown", label: "host offline" },
];

const UPDATE_OPTIONS: { value: ContainerUpdateFilter; label: string }[] = [
    { value: "all", label: "any update" },
    { value: "update", label: "has update" },
    { value: "current", label: "up to date" },
    { value: "unchecked", label: "not checked" },
];

// Styled like the search pill they sit next to, as in the activity list. On a phone the two
// share the row with the search, so each gets a width both fit in.
const PILL_SELECT = {
    select: "py-1 pl-3 pr-9 rounded-full border-border bg-app-bg text-sm truncate max-sm:w-[8.25rem]",
};

type RowKey = string | number;
import { CheckLabel } from "../../images/components/CheckLabel";

interface ManagedContainersProps {
    /** Limits the list to the containers of one project. */
    projectId?: string;
    /**
     * The query parameter the search is kept in, `search.<list>` where the list shares its
     * route with others. The two filters take the same suffix (`state.<list>`).
     */
    searchParamKey?: string;
}

export const ManagedContainers = ({ projectId, searchParamKey }: ManagedContainersProps = {}) => {
    const containers = useContainersData(projectId);
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const suffix = searchParamKey?.replace(/^search/, "") ?? "";
    const [stateParam, setStateFilter] = useSearchQueryParam(CONTAINER_FILTER_PARAMS.state + suffix);
    const [updateParam, setUpdateFilter] = useSearchQueryParam(CONTAINER_FILTER_PARAMS.update + suffix);
    const stateFilter = parseStateFilter(stateParam);
    const updateFilter = parseUpdateFilter(updateParam);
    const isFiltered = stateFilter !== "all" || updateFilter !== "all";
    const navigate = useNavigate();
    const {
        isAnyChecking,
        isChecking,
        isUpdating,
        checkUpdate,
        checkAll,
        pullAndRecreate,
        start,
        stop,
        restart,
        remove,
    } = useContainerActions();

    const filtered = useMemo(
        () => filterContainers(containers, { query: searchQuery, state: stateFilter, update: updateFilter }),
        [containers, searchQuery, stateFilter, updateFilter],
    );

    // Which groups are open. A filter and a search pick host rows -- they are what is being
    // looked for, so every group they leave is open until it is closed by hand; without
    // either, a group is open once it was opened. Two sets, so that looking through a filter
    // does not rearrange what was open before it.
    const narrowing = `${searchQuery}|${stateFilter}|${updateFilter}`;
    const isNarrowed = isFiltered || searchQuery !== "";
    const [opened, setOpened] = useState<Set<RowKey>>(() => new Set());
    const [closed, setClosed] = useState<{ under: string; keys: Set<RowKey> }>({ under: narrowing, keys: new Set() });
    const closedNow = closed.under === narrowing ? closed.keys : undefined;
    const expandedKeys = useMemo(
        () => (isNarrowed ? new Set<RowKey>(filtered.map((g) => g.id).filter((id) => !closedNow?.has(id))) : opened),
        [isNarrowed, filtered, closedNow, opened],
    );
    const setExpandedKeys = useCallback(
        (next: Set<RowKey>) => {
            if (!isNarrowed) return setOpened(next);
            setClosed({ under: narrowing, keys: new Set(filtered.map((g) => g.id).filter((id) => !next.has(id))) });
        },
        [isNarrowed, narrowing, filtered],
    );

    // No explicit return to page 1: a new query changes `data`, and the view resets its page
    // on that by itself.

    const getChildren = useCallback((node: ContainerTreeNode) => {
        if (node.nodeType === "container") return node.children ?? null;
        return null;
    }, []);

    const columns: DataTableDef<ContainerTreeNode>[] = useMemo(
        () => [
            {
                tableHeader: "Container",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.name : node.clientName,
                tableItemRender: (node: ContainerTreeNode) => {
                    const state = getNodeState(node);
                    const dot = <StatusDot {...stateDot(state)} />;
                    return node.nodeType === "container" ? (
                        <div className="flex items-center gap-2">
                            {dot}
                            <span className="text-sm font-medium">{node.name}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {dot}
                            <span className="text-sm text-text-muted">
                                {node.clientName}
                                {/* The dot is decorative; the text says why it is hollow. */}
                                {!node.clientOnline && " (offline)"}
                            </span>
                        </div>
                    );
                },
            },
            {
                tableHeader: "Image",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.configImage : "",
                tableItemRender: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? (
                        <span className="text-sm font-medium text-text-muted">
                            {node.configImage}
                        </span>
                    ) : null,
            },
            {
                tableHeader: "Clients",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.clientCount : 0,
                tableCellClassName: "text-sm text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? (
                        <span>{node.clientCount}</span>
                    ) : null,
            },
            {
                tableHeader: "Auto-Update",
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => (
                    <div className={`flex ${hasAutoUpdateSource(node.autoUpdate) ? "justify-start" : "justify-center"}`}>
                        <AutoUpdateSourceCell
                            enrollment={node.autoUpdate}
                            hasConflict={node.nodeType === "container" ? node.hasConflict : undefined}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Up-to-date",
                sortable: true,
                sortValue: (node: ContainerTreeNode) => updateStatusPriority(node.updateStatus),
                tableCellClassName: "text-center",
                tableHeaderClassName: "text-center",
                tableItemRender: (node: ContainerTreeNode) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={node.updateStatus}
                            isChecking={isChecking(node)}
                            isUpdating={isUpdating(node)}
                        />
                    </div>
                ),
            },
            {
                tableHeader: "Actions",
                tableHeaderClassName: "text-center",
                tableCellClassName: "content-center",
                tableItemRender: (node: ContainerTreeNode) => {
                    const menuEntries = containerMenuEntries(node, { start, stop, restart, remove });
                    return (
                        <div onClick={(e) => e.stopPropagation()}>
                            <DataAction
                                rowId={node.id}
                                actions={[
                                    {
                                        icon: RefreshCw,
                                        onClick: () => checkUpdate(node),
                                        tooltip: { enabled: "Check for updates", disabled: "Checking…" },
                                        color: "blue",
                                        disabled: isChecking(node),
                                    },
                                    {
                                        icon: Download,
                                        onClick: () => pullAndRecreate(node),
                                        tooltip: {
                                            enabled: "Pull & Recreate",
                                            disabled: isUpdating(node)
                                                ? "Pulling…"
                                                : node.updateStatus !== "update"
                                                    ? "No update available"
                                                    : "Client offline",
                                        },
                                        color: "green",
                                        disabled: node.updateStatus !== "update" || !isReachable(node) || isUpdating(node),
                                    },
                                ]}
                                menuEntries={menuEntries}
                            />
                        </div>
                    );
                },
            },
        ],
        [isChecking, isUpdating, checkUpdate, pullAndRecreate, start, stop, restart, remove],
    );

    // "all" writes no parameter: an empty value removes it.
    const filterSelects = (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                aria-label="Filter by state"
                fullWidth={false}
                classNames={PILL_SELECT}
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value === "all" ? "" : e.target.value)}
                options={STATE_OPTIONS}
            />
            <Select
                aria-label="Filter by update status"
                fullWidth={false}
                classNames={PILL_SELECT}
                value={updateFilter}
                onChange={(e) => setUpdateFilter(e.target.value === "all" ? "" : e.target.value)}
                options={UPDATE_OPTIONS}
            />
        </div>
    );

    return (
        <DataMultiView<ContainerTreeNode>
            title={
                <>
                    <Box size={18} className="text-text-muted" /> Containers
                </>
            }
            extraActions={
                <>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={() => checkAll(containers)}
                        disabled={isAnyChecking}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        <CheckLabel />
                    </Button>
                    {/* A whole project's pull only exists where the list is one project. */}
                    {projectId && <ProjectPullButton projectId={projectId} />}
                </>
            }
            viewMode={{ persist: { key: STORAGE_KEYS.containersView, scope: "local" } }}
            data={filtered}
            keyField="id"
            tableDef={columns}
            getChildren={getChildren}
            treeExpanded={{ value: expandedKeys, onChange: setExpandedKeys }}
            // `from` is where the page leads back to: this list may sit in a project's tab.
            onRowClick={(node) => navigate(containerPath(node))}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchActions={filterSelects}
            // The view knows of the search only; with a filter set, "none found" would
            // read as "there are none".
            emptyMessage={isFiltered ? "No containers match these filters." : "No containers found."}
            noResultsMessage="No containers match these filters."
            // In a project's tab the list shares its page with the project header.
            pagination={pagination(projectId ? PAGE_SIZE.embedded : PAGE_SIZE.page)}
            className="h-full"
        />
    );
};
