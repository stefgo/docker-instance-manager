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
import { ContainerTreeNode, composeProjectsOf } from "../lib/containerGroups";
import { filterContainers, parseStateFilter } from "../lib/filterContainers";
import { changeSelection, planSelection, selectedHostRows, shownSelection } from "../lib/selection";
import { useContainersData } from "../hooks/useContainersData";
import { checkTargets, containerMenuEntries, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { shortImageRef } from "../../images/lib/digest";
import { stateDot, containerPath, getNodeState } from "../containerState";
import { hasAutoUpdateSource } from "../autoUpdate";
import { AutoUpdateSourceCell } from "./AutoUpdateSourceCell";
import { NextCheckCell } from "./NextCheckCell";
import { ProjectPullButton } from "../../projects/components/ProjectPullButton";
import type { ProjectPullReach } from "../../projects/pullPlan";
import { containerKey } from "../../projects/lib/projectMembers";
import { pickLabel } from "../../projects/lib/pickLabel";
import { usePull } from "../../app/context/PullContext";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { EMPTY_VALUE, plural } from "../../../utils";
import { CONTAINER_FILTER_PARAMS, type ContainerStateFilter } from "../../../lib/paths";
import { UPDATE_FILTER_OPTIONS, parseUpdateFilter, updateStatusPriority } from "../../images/lib/updateStatus";

const STATE_OPTIONS: { value: ContainerStateFilter; label: string }[] = [
    { value: "all", label: "any state" },
    { value: "running", label: "running" },
    { value: "not-running", label: "not running" },
    { value: "unknown", label: "host offline" },
];

// On a phone the two filters share the row with the search, so each gets a width both fit in.
const FILTER_SELECT = {
    select: "truncate max-sm:w-[8.25rem]",
};

type RowKey = string | number;
import { CheckLabel } from "../../images/components/CheckLabel";
import { useConfirmCheck } from "../../images/hooks/useConfirmCheck";
import { listScope } from "../../../lib/listScope";

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
        pullAndRecreate,
        start,
        stop,
        restart,
        remove,
        startSelection,
        stopSelection,
    } = useContainerActions();
    const confirmCheck = useConfirmCheck();
    const pull = usePull();

    // By name: the tree table sorts by its columns, but the list a narrow screen shows keeps
    // the order it is handed.
    const filtered = useMemo(
        () =>
            filterContainers(containers, { query: searchQuery, state: stateFilter, update: updateFilter })
                .sort((a, b) => a.name.localeCompare(b.name)),
        [containers, searchQuery, stateFilter, updateFilter],
    );

    // The rows picked for an action on several at once. What a filter or the search takes
    // off the list leaves the selection as well: the header acts on what is shown.
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
    // list keeps what a row is acted on by -- name, state, update status -- and leaves
    // the two counting columns to the table and to the container's own page.
    const columns: DataColumnDef<ContainerTreeNode>[] = useMemo(
        () => [
            {
                header: "Container / Client",
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
                            {/* The image sits below the host's name. */}
                            <div className="min-w-0">
                                <div className="text-sm truncate">
                                    {node.clientName}
                                    {/* The dot is decorative; the text says why it is hollow. */}
                                    {!node.clientOnline && " (offline)"}
                                </div>
                                <div className="text-xs text-text-muted truncate" title={node.configImage}>
                                    {shortImageRef(node.configImage)}
                                </div>
                            </div>
                            {update}
                        </div>
                    );
                },
            },
            {
                header: "Compose Project",
                sortable: true,
                // A stack's containers sort together, the ones without Compose after them. A
                // group sorts by what its hosts share, those that differ before the ones
                // without Compose.
                sortValue: (node: ContainerTreeNode) => {
                    const projects = node.nodeType === "container" ? composeProjectsOf(node) : [node.composeProject];
                    return projects.length === 1 ? projects[0] ?? "\uffff" : "\ufffe";
                },
                table: { cellClassName: "text-sm" },
                list: false,
                // On the host rows alone: the project belongs to the container on one host.
                render: (node: ContainerTreeNode) =>
                    node.nodeType === "client" ? node.composeProject ?? EMPTY_VALUE : null,
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
                header: "Next Auto-Update",
                sortable: true,
                // The soonest first, the containers on no schedule after them.
                sortValue: (node: ContainerTreeNode) =>
                    node.nextCheck?.nextRun ? Date.parse(node.nextCheck.nextRun) : Infinity,
                table: { cellClassName: "text-center", headerClassName: "text-center" },
                list: false,
                render: (node: ContainerTreeNode) => (
                    <NextCheckCell
                        check={node.nextCheck}
                        earliest={node.nodeType === "container" && node.clientCount > 1}
                    />
                ),
            },
            {
                // A non-breaking hyphen after "Up": a narrow column breaks the heading after
                // "to-" alone, into two lines rather than three.
                header: "Up\u2011to-date",
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
                classNames={FILTER_SELECT}
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value === "all" ? "" : e.target.value)}
                options={STATE_OPTIONS}
            />
            <Select
                aria-label="Filter by update status"
                fullWidth={false}
                classNames={FILTER_SELECT}
                value={updateFilter}
                onChange={(e) => setUpdateFilter(e.target.value === "all" ? "" : e.target.value)}
                options={UPDATE_FILTER_OPTIONS}
            />
        </div>
    );

    const hasSelection = plan.rows > 0;
    const shownRows = filtered.reduce((sum, group) => sum + (group.children?.length ?? 0), 0);

    // What the header's pull reaches without a pick: every host row the list shows, as if
    // every group were picked.
    const shownPlan = useMemo(() => planSelection(filtered, new Set(filtered.map((g) => g.id))), [filtered]);
    const pullTargets = hasSelection ? plan.pull : shownPlan.pull;
    const pullCount = plan.pull.reduce(
        (sum, target) => sum + Object.values(target.containerIds ?? {}).flat().length,
        0,
    );

    // In a project's tab the pull is the project's, with its forced pull beside it, over the
    // same rows: the picked ones, the shown ones, or the whole project.
    const projectReach = useMemo((): ProjectPullReach => {
        const keysOf = (rows: ReturnType<typeof selectedHostRows>) =>
            new Set(rows.map((row) => containerKey(row.clientId, row.containerId)));
        if (hasSelection) return { scope: "selected", containerKeys: keysOf(selectedHostRows(filtered, selected)), selected: plan.rows };
        if (isNarrowed) return { scope: "shown", containerKeys: keysOf(filtered.flatMap((g) => g.children ?? [])) };
        return { scope: "all" };
    }, [hasSelection, isNarrowed, filtered, selected, plan.rows]);

    /** A header button's tooltip: how many of the picked containers it reaches. */
    const reach = (count: number) => (hasSelection ? `${plural(count, "container")} of the selection` : undefined);

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
                        Start and stop only for what is picked, so off until something is. The
                        pull and the check act on the picked rows once something is picked, and
                        on what the list shows before. With a pick each is off where it reaches
                        no picked container, and says in its tooltip how many it reaches. Not in
                        its label: a number there widens the button and moves its neighbours
                        with every pick. Every button asks first and names how many containers
                        it reaches. A pull, a start and a stop end the selection: the rows they
                        changed are no longer the rows that were picked. A check leaves it for
                        the pull that follows.
                    */}
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Play}
                        onClick={async () => {
                            if (await startSelection(plan.start, plan.rows)) clearSelection();
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
                            if (await stopSelection(plan.stop, plan.rows)) clearSelection();
                        }}
                        disabled={plan.stop.length === 0}
                        title={reach(plan.stop.length)}
                    >
                        Stop
                    </Button>
                    {projectId ? (
                        <ProjectPullButton
                            projectId={projectId}
                            reach={projectReach}
                            onPulled={clearSelection}
                            title={reach(plan.rows)}
                        />
                    ) : (
                        <Button
                            size="sm"
                            icon={Download}
                            onClick={async () => {
                                const request = hasSelection
                                    ? { targets: plan.pull, scope: "selected" as const, selected: plan.rows }
                                    : { targets: shownPlan.pull, scope: listScope(isNarrowed) };
                                if (await pull(request)) clearSelection();
                            }}
                            disabled={pullTargets.length === 0}
                            title={reach(pullCount)}
                        >
                            Pull &amp; Recreate
                        </Button>
                    )}
                    {/*
                        At the right end, next to the pull it prepares. The picked rows once
                        something is picked; without a pick what the list shows: with a filter
                        or a search, the hits alone. It asks first either way, and counts host
                        rows, as the title does.
                    */}
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={() =>
                            void (hasSelection
                                ? confirmCheck(
                                    { count: plan.rows, noun: "container", scope: "selected" },
                                    plan.check,
                                )
                                : confirmCheck(
                                    { count: shownRows, noun: "container", scope: listScope(isNarrowed) },
                                    checkTargets(filtered),
                                ))
                        }
                        disabled={isAnyChecking || (hasSelection ? plan.check.length === 0 : filtered.length === 0)}
                        title={reach(plan.rows)}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        <CheckLabel />
                    </Button>
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
            classNames={{ list: TREE_LIST }}
            selection={{
                value: selected,
                onChange: (next) => setPicked(changeSelection(filtered, picked, next)),
                // The boxes count groups and host rows; what is acted on are the containers.
                // Behind the title "Containers", which says what is counted -- in a project's
                // tab with the hosts, as on the project's other tabs.
                label: () => (projectId ? pickLabel(selectedHostRows(filtered, selected)) : `${plan.rows} selected`),
                rowLabel: (node) =>
                    node.nodeType === "container" ? `Select ${node.name}` : `Select ${node.containerName} on ${node.clientName}`,
            }}
        />
    );
};
