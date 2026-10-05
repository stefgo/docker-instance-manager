import { useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { Box, RefreshCw, Download, Play, Square } from "lucide-react";
import {
    Button,
    DataAction,
    DataMultiView,
    EmptyState,
    type DataColumnDef,
    Select,
    StatusDot,
    PAGE_SIZE,
    listPagination,
    TREE_LIST,
    treeActionsColumn,
    treeListGroups,
} from "@stefgo/react-ui-components";
import { ContainerTreeNode } from "../lib/containerGroups";
import { filterContainers, parseStateFilter, parseUpdateFilter } from "../lib/filterContainers";
import { changeSelection, planSelection, shownSelection } from "../lib/selection";
import { useContainersData } from "../hooks/useContainersData";
import { containerMenuEntries, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { stateDot, containerPath, getNodeState } from "../containerState";
import { hasAutoUpdateSource } from "../autoUpdate";
import { AutoUpdateSourceCell } from "./AutoUpdateSourceCell";
import { ProjectPullButton } from "../../projects/components/ProjectPullButton";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { plural } from "../../../utils";
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
        checkSelection,
        pullSelection,
        startSelection,
        stopSelection,
    } = useContainerActions();

    // By name: the tree table sorts by its columns, but the list a narrow screen shows keeps
    // the order it is handed.
    const filtered = useMemo(
        () =>
            filterContainers(containers, { query: searchQuery, state: stateFilter, update: updateFilter })
                .sort((a, b) => a.name.localeCompare(b.name)),
        [containers, searchQuery, stateFilter, updateFilter],
    );

    // The rows picked for an action on several at once. What a filter or the search takes
    // off the list leaves the selection as well: the bar acts on what is shown.
    // Kept as host rows; a group's box follows from the rows under it.
    const [picked, setPicked] = useState<ReadonlySet<RowKey>>(() => new Set());
    const selected = useMemo(() => shownSelection(filtered, picked), [filtered, picked]);
    const plan = useMemo(() => planSelection(filtered, selected), [filtered, selected]);
    const clearSelection = useCallback(() => setPicked(new Set()), []);

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

    // One definition for the tree table and for the list a narrow screen shows instead. The
    // list keeps what a row is acted on by -- name, state, image, update status -- and leaves
    // the two counting columns to the table and to the container's own page.
    const columns: DataColumnDef<ContainerTreeNode>[] = useMemo(
        () => [
            {
                header: "Container",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.name : node.clientName,
                list: { label: null },
                render: (node: ContainerTreeNode, view) => {
                    const state = getNodeState(node);
                    const dot = <StatusDot {...stateDot(state)} />;
                    // In the list the update status has no column of its own; it follows the name.
                    const update = view === "list" && (
                        <span className="shrink-0">
                            <UpdateIcon
                                status={node.updateStatus}
                                isChecking={isChecking(node)}
                                isUpdating={isUpdating(node)}
                            />
                        </span>
                    );
                    return node.nodeType === "container" ? (
                        <div className="flex items-center gap-2 min-w-0">
                            {dot}
                            <span className="text-sm font-medium truncate">{node.name}</span>
                            {update}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 min-w-0">
                            {dot}
                            <span className="text-sm text-text-muted truncate">
                                {node.clientName}
                                {/* The dot is decorative; the text says why it is hollow. */}
                                {!node.clientOnline && " (offline)"}
                            </span>
                            {update}
                        </div>
                    );
                },
            },
            {
                header: "Image",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.configImage : "",
                list: { label: null },
                render: (node: ContainerTreeNode, view) =>
                    node.nodeType === "container" ? (
                        <span
                            className={
                                view === "list"
                                    ? "block truncate pl-4 text-xs text-text-muted"
                                    : "text-sm font-medium text-text-muted"
                            }
                        >
                            {node.configImage}
                        </span>
                    ) : null,
            },
            {
                header: "Clients",
                sortable: true,
                sortValue: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? node.clientCount : 0,
                table: { cellClassName: "text-sm text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ContainerTreeNode) =>
                    node.nodeType === "container" ? (
                        <span>{node.clientCount}</span>
                    ) : null,
            },
            {
                header: "Auto-Update",
                table: { cellClassName: "text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ContainerTreeNode) => (
                    <div className={`flex ${hasAutoUpdateSource(node.autoUpdate) ? "justify-start" : "justify-center"}`}>
                        <AutoUpdateSourceCell
                            enrollment={node.autoUpdate}
                            hasConflict={node.nodeType === "container" ? node.hasConflict : undefined}
                        />
                    </div>
                ),
            },
            {
                header: "Up-to-date",
                sortable: true,
                sortValue: (node: ContainerTreeNode) => updateStatusPriority(node.updateStatus),
                table: { cellClassName: "text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ContainerTreeNode) => (
                    <div className="flex justify-center">
                        <UpdateIcon
                            status={node.updateStatus}
                            isChecking={isChecking(node)}
                            isUpdating={isUpdating(node)}
                        />
                    </div>
                ),
            },
            treeActionsColumn((node: ContainerTreeNode) => {
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
            }),
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

    const pullCount = plan.pull.reduce(
        (sum, target) => sum + Object.values(target.containerIds ?? {}).flat().length,
        0,
    );

    /** A header button's tooltip: how many of the picked containers it reaches. */
    const reach = (count: number) => (plan.rows > 0 ? `${plural(count, "container")} of the selection` : undefined);

    return (
        <DataMultiView<ContainerTreeNode>
            title={
                <>
                    <Box size={18} className="text-text-muted" /> Containers
                </>
            }
            extraActions={
                <>
                    {/*
                        Always there, next to the check: each is off where it reaches no
                        container -- so all three are off until something is picked -- and
                        says in its tooltip how many it reaches. Not in its label: a number
                        there widens the button and moves its neighbours with every pick.
                        A pull, a start and a stop end the selection: the rows they changed
                        are no longer the rows that were picked.
                    */}
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        onClick={async () => {
                            if (await pullSelection(plan.pull)) clearSelection();
                        }}
                        disabled={pullCount === 0}
                        title={reach(pullCount)}
                    >
                        Pull &amp; Recreate
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Play}
                        onClick={() => {
                            startSelection(plan.start);
                            clearSelection();
                        }}
                        disabled={plan.start.length === 0}
                        title={reach(plan.start.length)}
                    >
                        Start
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Square}
                        onClick={async () => {
                            if (await stopSelection(plan.stop)) clearSelection();
                        }}
                        disabled={plan.stop.length === 0}
                        title={reach(plan.stop.length)}
                    >
                        Stop
                    </Button>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        // One button for both: a second "Check" next to it would only differ
                        // by where it stands. A check leaves the selection for the pull that
                        // follows.
                        onClick={() => (plan.rows > 0 ? checkSelection(plan.check) : checkAll(containers))}
                        disabled={isAnyChecking}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                        title={reach(plan.rows)}
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
            columns={columns}
            listGroups={treeListGroups()}
            getChildren={getChildren}
            treeExpanded={{ value: expandedKeys, onChange: setExpandedKeys }}
            // `from` is where the page leads back to: this list may sit in a project's tab.
            onRowClick={(node) => navigate(containerPath(node))}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            searchable
            searchPlaceholder="Search containers…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchActions={filterSelects}
            // The search and the filters prune the tree in front of the view -- a group stays
            // for a host row that matches, which the view's own filter, asked about the top
            // rows only, cannot say. So "there are none" is told from "none match" here.
            emptyMessage={
                containers.length === 0
                    ? <EmptyState icon={Box} title="No containers found" />
                    : "No containers match these filters."
            }
            // In a project's tab the list shares its page with the project header.
            pagination={listPagination(projectId ? PAGE_SIZE.embedded : PAGE_SIZE.page)}
            className="h-full"
            // Five buttons: on a narrow header they take a second line.
            classNames={{ list: TREE_LIST, extraActionsWrapper: "flex-wrap justify-end" }}
            selection={{
                value: selected,
                onChange: (next) => setPicked(changeSelection(filtered, picked, next)),
                // The boxes count groups and host rows; what is acted on are the containers.
                // Behind the title "Containers", which says what is counted.
                label: () => `${plan.rows} selected`,
                rowLabel: (node) =>
                    node.nodeType === "container" ? `Select ${node.name}` : `Select ${node.containerName} on ${node.clientName}`,
            }}
        />
    );
};
