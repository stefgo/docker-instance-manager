import { useCallback, useMemo, useState } from "react";
import {
    AlertCircle,
    AlertTriangle,
    Info,
    ChevronRight,
    ChevronDown,
    Eye,
    EyeOff,
    Server,
    Box,
    Layers,
    Boxes,
    Activity,
    Footprints,
    MoreVertical,
    Trash2,
    Tag,
    type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
    ActionButton,
    ActionMenu,
    Button,
    cn,
    DataAction,
    DataMultiView,
    DataTableDef,
    Select,
    useActionMenu,
    useConfirm,
    useToast,
} from "@stefgo/react-ui-components";
import { ACTIVITY_LEVELS, ActivityLevel, ActivityRecord, activityDetail, activityMessage } from "@dim/shared";
import { unseenTone } from "../lib/unseenTone";
import { useActivity, useClearActivity, useMarkActivitySeen } from "../../../queries/activity";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { ActivityGroupSteps } from "./ActivityGroupSteps";
import { groupActivity } from "../lib/groupActivity";
import { type ActivityLinks, activityLinks } from "../lib/activityLinks";
import { type ActivityRow, collapseRepeats, rowEvents } from "../lib/collapseRepeats";
import { describeDeleteAllActivity } from "../confirmations";
import { clientName, formatDate, getErrorMessage, plural } from "../../../utils";
import { RelativeTime } from "../../../components/RelativeTime";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { useClients } from "../../../queries/clients";
import { STORAGE_KEYS, type StorageKey } from "../../../lib/storageKeys";

const levelIcon: Record<ActivityLevel, React.ReactNode> = {
    error: <AlertCircle size={16} className="text-error shrink-0" />,
    warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
    info: <Info size={16} className="text-info shrink-0" />,
    trace: <Footprints size={16} className="text-text-muted shrink-0" />,
};

const CHIP = "inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted";

/** One thing an event is about. With a target it is the way to that thing's page. */
function SubjectChip({ icon: Icon, to, children }: { icon: LucideIcon; to?: string; children: React.ReactNode }) {
    if (!to) {
        return (
            <span className={CHIP}>
                <Icon size={10} /> {children}
            </span>
        );
    }
    return (
        <Link to={to} className={cn(CHIP, "hover:text-text-primary hover:underline")}>
            <Icon size={10} /> {children}
        </Link>
    );
}

/**
 * What an event is about, and last its kind: the name a webhook filter and `{{event.kind}}`
 * know it by, which the sentence above does not show. The kind has no page and stays text.
 * `kind={false}` leaves it out, for a row that stands for events of several kinds.
 */
function SubjectBadges({ event, links, kind = true }: { event: ActivityRecord; links: ActivityLinks; kind?: boolean }) {
    const subject = event.subject;
    const clientName = typeof event.data?.clientName === "string" ? event.data.clientName : null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {clientName && <SubjectChip icon={Server} to={links.client}>{clientName}</SubjectChip>}
            {subject?.containerName && (
                <SubjectChip icon={Box} to={links.container}>{subject.containerName}</SubjectChip>
            )}
            {subject?.imageRef && <SubjectChip icon={Layers} to={links.image}>{subject.imageRef}</SubjectChip>}
            {subject?.projectName && (
                <SubjectChip icon={Boxes} to={links.project}>{subject.projectName}</SubjectChip>
            )}
            {kind && <SubjectChip icon={Tag}>{event.kind}</SubjectChip>}
        </div>
    );
}

/**
 * What the search box matches an event against: the sentence a reader sees, the kind it was
 * phrased from, and the host, container, image and project it is about. A group matches when
 * any of its events does, so a step is found under the operation it belongs to.
 */
function searchText(event: ActivityRecord): string {
    const subject = event.subject;
    return [
        activityMessage(event),
        activityDetail(event),
        event.kind,
        typeof event.data?.clientName === "string" ? event.data.clientName : null,
        subject?.containerName,
        subject?.imageRef,
        subject?.projectName,
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
}

/**
 * The level filter is a minimum, and its entries say so: "≥ warning". Short, because both
 * filters stand next to the search on a phone. The most severe level has nothing above it.
 */
const levelLabel = (level: ActivityLevel): string =>
    level === ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1] ? level : `≥ ${level}`;

interface ActivityViewProps {
    /**
     * Narrows the list to the events it accepts. A group is shown when any of its events is
     * accepted, so a step of an operation brings the whole operation along. The level and
     * seen filters then start from what is left, and "Delete all" is not offered: it would
     * delete more than the list shows.
     */
    filter?: (event: ActivityRecord) => boolean;
    /** The query parameter the search is kept in, for a page that has another list. */
    searchParamKey?: string;
    /** Where the view mode is remembered, one key per place the list is shown. */
    persistKey?: StorageKey;
    pageSize?: number;
}

/**
 * The activity list: structured events, not messages written for the reader.
 *
 * Two things follow from that and are visible here: the text of a row is written in
 * `activityText` out of `kind` and `data`, not taken from the event, and a multi-step
 * operation is a group of full events rather than one entry with a list of sentences
 * attached. The level filter works on the field itself, so "warning and above" means exactly
 * that; the search box covers everything a reader would look for by name.
 */
export function ActivityView({
    filter,
    searchParamKey = "search",
    persistKey = STORAGE_KEYS.activityView,
    pageSize = PAGE_SIZE.page,
}: ActivityViewProps = {}) {
    const events = useActivity();
    const { mutate: markSeen } = useMarkActivitySeen();
    const { mutateAsync: clearAll } = useClearActivity();
    const { show } = useToast();

    // The rows turn seen at once and go back if the server refuses; the toast says why they
    // did. The store used to keep the reason in a field nothing read.
    const markManySeen = useCallback(
        (ids: string[]) => {
            if (ids.length === 0) return;
            markSeen(ids, {
                onError: (e) =>
                    show({ variant: "error", title: "Could not mark the events as seen", description: getErrorMessage(e) }),
            });
        },
        [markSeen, show],
    );
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const { confirm } = useConfirm();
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const clients = useClients().clients;
    // A minimum, not an exact match: "info" shows everything but the trace level. The page
    // opens on what needs a look: "error" while an error is unseen, else "warning" while a
    // warning is, else "info". That start is fixed once the list is known, so marking a row
    // seen does not pull the filter out from under the reader; until then it follows the list.
    const [chosenLevel, setChosenLevel] = useState<ActivityLevel | null>(null);
    // Whether seen entries are listed at all. Under "unseen" a row leaves the list as soon as
    // it is marked seen, which is the point: what is left is what has not been looked at.
    const [seenFilter, setSeenFilter] = useState<"all" | "unseen">("unseen");
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    // Events recorded before the server stored `clientName` with them name no host. The
    // client list still knows it as long as the host exists, so the name is filled in here.
    const named = useMemo(() => {
        const names = new Map(clients.map((c) => [c.id, clientName(c)]));
        return events.map((event) => {
            if (!event.clientId || typeof event.data?.clientName === "string") return event;
            const clientName = names.get(event.clientId);
            return clientName ? { ...event, data: { ...event.data, clientName } } : event;
        });
    }, [events, clients]);

    // A chip links to a host's page only while the host is still there.
    const clientIds = useMemo(() => new Set(clients.map((c) => c.id)), [clients]);

    const groups = useMemo(() => {
        const all = groupActivity(named);
        return filter
            ? all.filter((group) => [group.head, ...group.members].some(filter))
            : all;
    }, [named, filter]);

    // The start level is read off what this list covers, not off the whole log: a page
    // narrowed to one project should not open on "error" for an error somewhere else.
    const covered = useMemo(
        () => (filter ? groups.flatMap((g) => [g.head, ...g.members]) : events),
        [filter, groups, events],
    );
    const startLevel: ActivityLevel = unseenTone(covered) ?? "info";
    if (chosenLevel === null && covered.length > 0) {
        setChosenLevel(startLevel);
    }
    const levelFilter = chosenLevel ?? startLevel;

    const filtered = useMemo(
        () =>
            groups.filter((group) => {
                if (ACTIVITY_LEVELS.indexOf(group.level) < ACTIVITY_LEVELS.indexOf(levelFilter)) {
                    return false;
                }
                if (seenFilter === "unseen" && !group.unseen) return false;
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                if (group.title?.toLowerCase().includes(q)) return true;
                return [group.head, ...group.members].some((event) =>
                    searchText(event).includes(q),
                );
            }),
        [groups, levelFilter, seenFilter, searchQuery],
    );

    // After the filters, so what they take away no longer stands between two repeats.
    const rows = useMemo(() => collapseRepeats(filtered), [filtered]);

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /**
     * A row is one group and its repeats, so seeing it means seeing everything under it -- in
     * one request, and only for the events that are not seen yet.
     */
    const handleMarkSeen = (row: ActivityRow) => {
        markManySeen(rowEvents(row).filter((e) => !e.seen).map((e) => e.id));
    };

    const tableDef: DataTableDef<ActivityRow>[] = [
        {
            tableHeader: "",
            tableHeaderClassName: "px-0 pl-6 w-px",
            // The row grows when a group is expanded, so the icon is pinned to the top line
            // of the message instead of floating in the middle of the row.
            tableCellClassName: "px-0 pl-6 w-px align-top pt-2.5",
            tableItemRender: (g) => levelIcon[g.level],
        },
        {
            tableHeader: "Message",
            tableItemRender: (g) => {
                const isExpanded = expandedIds.has(g.head.id);
                // A folded burst is named by its title; its head is one of the steps.
                const steps = g.title ? [g.head, ...g.members] : g.members;
                const detail = g.title ? "" : activityDetail(g.head);
                const expandable = !!detail || steps.length > 0 || g.repeats.length > 0;
                return (
                    <div className={`flex items-start gap-2 w-full ${g.unseen ? "" : "opacity-60"}`}>
                        <div className="mt-0.5 shrink-0 w-[14px]">
                            {expandable && (
                                <ActionButton
                                    icon={isExpanded ? ChevronDown : ChevronRight}
                                    size="sm"
                                    tooltip={isExpanded ? "Collapse" : "Expand"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpand(g.head.id);
                                    }}
                                />
                            )}
                        </div>
                        <div className="w-full min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <p className={`text-sm text-text-primary truncate ${g.unseen ? "font-medium" : ""}`}>
                                    {g.title ?? activityMessage(g.head)}
                                </p>
                                {steps.length > 0 && (
                                    <span className="shrink-0 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                                        {plural(steps.length, "step")}
                                    </span>
                                )}
                                {g.repeats.length > 0 && (
                                    <span
                                        className="shrink-0 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted"
                                        title={`${g.repeats.length + 1} times, last at the time shown`}
                                    >
                                        {g.repeats.length + 1}×
                                    </span>
                                )}
                            </div>
                            {isExpanded && detail && (
                                <p className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-words">
                                    {detail}
                                </p>
                            )}
                            {isExpanded && steps.length > 0 && <ActivityGroupSteps members={steps} />}
                            {isExpanded && g.repeats.length > 0 && (
                                <p className="mt-1 text-xs text-text-muted break-words">
                                    Also{" "}
                                    {g.repeats
                                        .map((repeat) => formatDate(repeat.head.occurredAt, { seconds: true }))
                                        .join(" · ")}
                                </p>
                            )}
                            {/* A folded burst is several kinds; the one of its first step would mislead. */}
                            <SubjectBadges event={g.head} links={activityLinks(g.head, clientIds)} kind={!g.title} />
                        </div>
                    </div>
                );
            },
        },
        {
            tableHeader: "Time",
            tableHeaderClassName: "w-px whitespace-nowrap",
            tableCellClassName: "w-px whitespace-nowrap text-sm text-text-muted",
            sortable: true,
            sortValue: (g) => new Date(g.head.occurredAt).getTime(),
            tableItemRender: (g) => <RelativeTime date={g.head.occurredAt} seconds />,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "w-px text-center",
            tableCellClassName: "w-px content-center",
            tableItemRender: (g) => (
                <DataAction
                    rowId={g.head.id}
                    actions={[
                        ...(g.unseen
                            ? [{
                                    icon: Eye,
                                    onClick: () => handleMarkSeen(g),
                                    tooltip: "Mark as seen",
                                    color: "blue" as const,
                                }]
                            : [{
                                    icon: EyeOff,
                                    onClick: () => {},
                                    tooltip: "Already seen",
                                    color: "gray" as const,
                                }]),
                    ]}
                />
            ),
        },
    ];

    // "Mark as seen" acts on what the level filter and the search leave on screen, every page
    // of it -- not on events the reader has not been shown.
    const unseenShown = filtered
        .flatMap((g) => [g.head, ...g.members, ...g.superseded])
        .filter((e) => !e.seen)
        .map((e) => e.id);

    // Styled like the search pill they sit next to rather than like form fields: same height,
    // radius, border and background, so the bar reads as one row of controls.
    const pillSelect = {
        select: "py-1 pl-3 pr-9 rounded-full border-border bg-app-bg text-sm",
    };
    const filterSelects = (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                aria-label="Filter by seen state"
                fullWidth={false}
                classNames={pillSelect}
                value={seenFilter}
                onChange={(e) => setSeenFilter(e.target.value as "all" | "unseen")}
                options={[
                    { value: "all", label: "Show: all" },
                    { value: "unseen", label: "Show: unseen" },
                ]}
            />
            <Select
                aria-label="Filter by level"
                fullWidth={false}
                classNames={pillSelect}
                value={levelFilter}
                onChange={(e) => setChosenLevel(e.target.value as ActivityLevel)}
                options={ACTIVITY_LEVELS.map((level) => ({ value: level, label: levelLabel(level) }))}
            />
        </div>
    );

    const extraActions = (
        <div className="flex flex-wrap items-center gap-2">
            {unseenShown.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => markManySeen(unseenShown)}>
                    Mark as seen
                </Button>
            )}
            {!filter && groups.length > 0 && (
                <div className="relative">
                    <ActionButton
                        icon={MoreVertical}
                        aria-label="Activity actions"
                        onClick={(e) => openMenu(e, "activity")}
                    />
                    <ActionMenu
                        isOpen={menuState?.id === "activity"}
                        onClose={closeMenu}
                        anchor={menuState?.anchor ?? null}
                        triggerRef={triggerRef}
                    >
                        {/* Closes the menu first: the dialog would otherwise sit under it. */}
                        <button
                            onClick={() => {
                                closeMenu();
                                confirm({ ...describeDeleteAllActivity(events.length), onConfirm: () => clearAll() });
                            }}
                            className={cn(MENU_ENTRY, "text-error")}
                        >
                            <Trash2 size={16} /> Delete all
                        </button>
                    </ActionMenu>
                </div>
            )}
        </div>
    );

    return (
        <DataMultiView<ActivityRow>
            title={
                <>
                    <Activity size={18} className="text-text-muted" /> Activity
                </>
            }
            viewMode={{ persist: { key: persistKey, scope: "local" } }}
            data={rows}
            tableDef={tableDef}
            keyField={(g) => g.head.id}
            // Column 2 is the time. Column 3 is the action column, which has no sort value.
            sort={{ defaultValue: [{ colIndex: 2, direction: "desc" }] }}
            emptyMessage="Nothing has happened yet."
            noResultsMessage="No events match these filters."
            pagination={pagination(pageSize)}
            searchable
            searchPlaceholder="Search activity…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchActions={filterSelects}
            extraActions={extraActions}
            classNames={{ table: { table: "w-full" } }}
        />
    );
}
