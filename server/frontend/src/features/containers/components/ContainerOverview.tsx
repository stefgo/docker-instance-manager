import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Download, MoreVertical, RefreshCw } from "lucide-react";
import { DockerContainer } from "@dim/shared";
import {
    ActionButton,
    ActionMenu,
    Badge,
    Button,
    cn,
    DataAction,
    DataMultiView,
    type DataColumnDef,
    EntityHeader,
    type EntityDetail,
    useActionMenu,
    StatusDot,
    LoadingIndicator,
} from "@stefgo/react-ui-components";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useEscapeToLeave } from "../../../hooks/useEscapeToLeave";
import { useNow } from "../../../hooks/useNow";
import { plural } from "../../../utils";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { actionsColumn, listGroups } from "../../../components/listColumns";
import { ActivityView } from "../../activity/components/ActivityView";
import { ClientLabel } from "../../clients/components/ClientLabel";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { UpdateStatus } from "../../images/hooks/useImagesData";
import { summarizeChecks } from "../../images/lib/checkSummary";
import { ClientNode, ContainerAggregateState, useContainersData } from "../hooks/useContainersData";
import { containerMenuEntries, isReachable, useContainerActions } from "../hooks/useContainerActions";
import { stateDot, containerPath, containerStatus, getInstances, getNodeState } from "../containerState";
import { containerActivityFilter } from "../activityFilter";
import { hasAutoUpdateSource } from "../autoUpdate";
import { AutoUpdateSourceCell } from "./AutoUpdateSourceCell";
import { ContainerStatus } from "./ContainerStatus";
import { useDockerStates } from "../../../queries/docker";

const STATE_BADGE: Record<ContainerAggregateState, { label: string; variant: "success" | "warning" | "neutral" }> = {
    running: { label: "Running", variant: "success" },
    paused: { label: "Paused", variant: "warning" },
    stopped: { label: "Stopped", variant: "neutral" },
    mixed: { label: "Mixed", variant: "warning" },
    unknown: { label: "Unknown", variant: "neutral" },
};

// `none` gets no badge: a container without a pullable image has nothing to be current with.
const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

/** One instance of the container, with what the agent reported about it. */
interface InstanceRow {
    id: string;
    node: ClientNode;
    container: DockerContainer | undefined;
}

const LIST_GROUPS = listGroups();

// Cell contents shared by the table and the list view, so the two cannot drift apart.

const ClientCell = ({ row }: { row: InstanceRow }) => (
    <ClientLabel name={row.node.clientName} online={row.node.clientOnline} />
);

// An offline host's last snapshot is not its present: the state is unknown until the agent
// reports again, not whatever it was when the host went away.
const StateCell = ({ row }: { row: InstanceRow }) => {
    const state = getNodeState(row.node);
    return (
        <div className="flex items-center gap-2">
            <StatusDot {...stateDot(state)} />
            <span className="text-sm text-text-muted">
                {row.node.clientOnline
                    ? row.container ? <ContainerStatus container={row.container} /> : row.node.containerState
                    : "Unknown (client offline)"}
            </span>
        </div>
    );
};

interface ContainerOverviewProps {
    /** The group key of `useContainersData`: `name||configImage`, already decoded by the router. */
    containerId: string | undefined;
}

export const ContainerOverview = ({ containerId }: ContainerOverviewProps) => {
    const navigate = useNavigate();
    const { state, pathname, search } = useLocation();
    // The list that opened this page says where it is -- it may be a project's tab. A URL
    // opened directly leads back to the fleet-wide list.
    const back = (state as { from?: string } | null)?.from ?? "/containers";

    const containers = useContainersData();
    const dockerStates = useDockerStates();
    const [searchQuery, setSearchQuery] = useSearchQueryParam("search");
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const {
        isChecking,
        isUpdating,
        checkUpdate,
        pullAndRecreate,
        start,
        stop,
        remove,
    } = useContainerActions();

    const node = containerId ? containers.find((c) => c.id === containerId) : undefined;
    const activityFilter = useMemo(() => (node ? containerActivityFilter(node) : undefined), [node]);

    const rows: InstanceRow[] = useMemo(() => {
        if (!node) return [];
        return (node.children ?? []).map((child) => ({
            id: child.id,
            node: child,
            container: dockerStates[child.clientId]?.containers.find((c) => c.id === child.containerId),
        }));
    }, [node, dockerStates]);

    // The search matches the status as shown, so it reads the same clock the cells do.
    const now = useNow();
    const filtered = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows.filter(
            (r) =>
                r.node.clientName.toLowerCase().includes(q) ||
                (r.container ? containerStatus(r.container, now).toLowerCase().includes(q) : false) ||
                (r.container?.image.toLowerCase().includes(q) ?? false),
        );
    }, [rows, searchQuery, now]);

    useEscapeToLeave(back);

    const renderUpToDate = useCallback((r: InstanceRow) => (
        <UpdateIcon
            status={r.node.updateStatus}
            isChecking={isChecking(r.node)}
            isUpdating={isUpdating(r.node)}
        />
    ), [isChecking, isUpdating]);

    const renderActions = useCallback((r: InstanceRow) => (
        <DataAction
            rowId={r.id}
            actions={[
                {
                    icon: RefreshCw,
                    onClick: () => checkUpdate(r.node),
                    tooltip: { enabled: "Check for Update", disabled: "Checking…" },
                    color: "blue",
                    disabled: isChecking(r.node),
                },
                {
                    icon: Download,
                    onClick: () => pullAndRecreate(r.node),
                    tooltip: {
                        enabled: "Pull & Recreate",
                        disabled: !r.node.clientOnline
                            ? "Client offline"
                            : isUpdating(r.node)
                                ? "Pulling…"
                                : "No update available",
                    },
                    color: "green",
                    disabled: !r.node.clientOnline || r.node.updateStatus !== "update" || isUpdating(r.node),
                },
            ]}
            menuEntries={containerMenuEntries(r.node, { start, stop, remove })}
        />
    ), [isChecking, isUpdating, checkUpdate, pullAndRecreate, start, stop, remove]);

    const columns: DataColumnDef<InstanceRow>[] = useMemo(
        () => [
            {
                header: "Client",
                sortable: true,
                sortValue: (r) => r.node.clientName,
                list: { label: null },
                render: (r, view) =>
                    view === "list" ? (
                        <div className="py-1 font-medium text-text-primary">
                            <ClientCell row={r} />
                        </div>
                    ) : (
                        <ClientCell row={r} />
                    ),
            },
            {
                header: "State",
                sortable: true,
                sortValue: (r) => getNodeState(r.node),
                render: (r) => <StateCell row={r} />,
            },
            {
                header: "Image",
                sortable: true,
                sortValue: (r) => r.container?.image ?? "",
                table: { cellClassName: "text-sm max-w-[200px] truncate" },
                render: (r, view) => (
                    <span className={view === "list" ? "text-sm" : undefined}>{r.container?.image ?? "–"}</span>
                ),
            },
            {
                header: "Auto-Update",
                table: { headerClassName: "text-center", cellClassName: "text-center" },
                render: (r, view) =>
                    view === "list" ? (
                        <AutoUpdateSourceCell enrollment={r.node.autoUpdate} />
                    ) : (
                        <div className={`flex ${hasAutoUpdateSource(r.node.autoUpdate) ? "justify-start" : "justify-center"}`}>
                            <AutoUpdateSourceCell enrollment={r.node.autoUpdate} />
                        </div>
                    ),
            },
            {
                header: "Up-to-date",
                table: { headerClassName: "text-center", cellClassName: "text-center" },
                render: (r, view) =>
                    view === "list" ? renderUpToDate(r) : <div className="flex justify-center">{renderUpToDate(r)}</div>,
            },
            actionsColumn<InstanceRow>((r) => (
                <div onClick={(e) => e.stopPropagation()}>{renderActions(r)}</div>
            )),
        ],
        [renderUpToDate, renderActions],
    );

    if (!node) {
        return containers.length === 0 ? (
            <LoadingIndicator label="Loading containers…" />
        ) : (
            <NotFoundCard title="Container not found" backTo="/containers" backLabel="Back to containers">
                No container in the fleet matches <code className="font-mono text-sm">{containerId}</code>.
            </NotFoundCard>
        );
    }

    // Counted on connected hosts only; the offline ones are named apart, as neither.
    const reachable = getInstances(node);
    const running = reachable.filter((i) => i.state === "running").length;
    const offline = node.instances.length - reachable.length;
    const stateBadge = STATE_BADGE[node.aggregateState];
    const updateBadge = UPDATE_BADGE[node.updateStatus];
    const checking = isChecking(node);
    const updating = isUpdating(node);

    // What the update badge cannot say: when the registry was last asked, and what it
    // answered -- a rate limit or a denied request otherwise leaves the page silent.
    const { lastChecked, result: checkResult } = summarizeChecks(node.updateChecks);

    const details: EntityDetail[] = [
        { label: "Configured Image", value: node.configImage || "–", copyable: node.configImage || undefined },
        { label: "Running", value: `${running} / ${reachable.length}` },
        ...(offline > 0 ? [{ label: "Offline", value: plural(offline, "client") }] : []),
        {
            label: "Auto-Update",
            value: <AutoUpdateSourceCell enrollment={node.autoUpdate} hasConflict={node.hasConflict} />,
        },
        { label: "Last Checked", value: lastChecked },
        ...(checkResult
            ? [{
                label: "Check Result",
                value: checkResult === "OK"
                    ? checkResult
                    : <span className="text-error">{checkResult}</span>,
            }]
            : []),
    ];

    // Each entry closes the menu first: a dialog opened from it would otherwise sit under it.
    const menuAction = (action: () => void) => () => {
        closeMenu();
        action();
    };

    return (
        <div className="space-y-6">
            <EntityHeader
                // The icon of the Container entry in the navigation; the state is the badge's.
                leading={<Box size={24} className="text-text-muted" />}
                title={node.name}
                meta={
                    <>
                        <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
                        {updateBadge && <Badge variant={updateBadge.variant}>{updateBadge.label}</Badge>}
                    </>
                }
                details={details}
                // Names the view, not the container: one entry for every container page.
                persist={{ key: "dim.container.details", scope: "local" }}
                actions={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Container actions"
                            onClick={(e) => openMenu(e, node.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === node.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            {containerMenuEntries(node, {
                                start,
                                stop,
                                // The page of a removed container has nothing left to show.
                                remove: (n) => remove(n, () => navigate(back)),
                            }).map((entry) => (
                                <button
                                    key={entry.label.enabled}
                                    onClick={menuAction(entry.onClick)}
                                    disabled={entry.disabled}
                                    className={entry.variant === "danger" ? cn(MENU_ENTRY, "text-error") : MENU_ENTRY}
                                >
                                    <entry.icon size={16} /> {entry.label.enabled}
                                </button>
                            ))}
                        </ActionMenu>
                    </div>
                }
            />

            <DataMultiView<InstanceRow>
                title={<><Box size={18} className="text-text-muted" /> Instances</>}
                // For every instance at once; a row's own buttons act on that instance alone.
                extraActions={
                    <>
                        <Button
                            size="sm"
                            icon={RefreshCw}
                            onClick={() => checkUpdate(node)}
                            disabled={checking}
                            classNames={{ icon: checking ? "animate-spin" : "" }}
                        >
                            Check
                        </Button>
                        <Button
                            size="sm"
                            icon={Download}
                            onClick={() => pullAndRecreate(node)}
                            disabled={node.updateStatus !== "update" || !isReachable(node) || updating}
                            isLoading={updating}
                        >
                            Pull & Recreate
                        </Button>
                    </>
                }
                viewMode={{ persist: { key: "containerOverviewInstancesView", scope: "local" } }}
                data={filtered}
                columns={columns}
                // The first block takes the row's width, so the actions end up on the right.
                listGroups={LIST_GROUPS}
                keyField="id"
                // A row opens that instance's own page, which leads back here.
                onRowClick={(r) => navigate(containerPath(r.node), { state: { from: pathname + search } })}
                rowClassName="align-top"
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                searchable
                searchPlaceholder="Search instances…"
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No instances found."
                pagination={pagination(PAGE_SIZE.embedded)}
            />

            {/* What happened to the container on every host. History rather than an inbox
                here, so seen entries are listed from the start. */}
            <ActivityView
                filter={activityFilter}
                searchParamKey="search.activity"
                persistKey="containerActivityView"
                pageSize={PAGE_SIZE.embedded}
            />
        </div>
    );
};
