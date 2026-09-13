import { useMemo, useState } from "react";
import {
    AlertCircle,
    AlertTriangle,
    Info,
    ChevronRight,
    ChevronDown,
    Trash2,
    Bell,
    Eye,
    EyeOff,
    Server,
    Box,
    Layers,
    Boxes,
} from "lucide-react";
import {
    ActionButton,
    Button,
    DataAction,
    DataMultiView,
    DataTableDef,
    Select,
} from "@stefgo/react-ui-components";
import { ACTIVITY_LEVELS, ActivityLevel, ActivityRecord } from "@dim/shared";
import { format } from "date-fns";
import { useActivityStore } from "../../../stores/useActivityStore";
import { ActivityGroupSteps } from "./ActivityGroupSteps";
import { activityDetail, activityMessage } from "../lib/activityText";
import { ActivityGroup, groupActivity } from "../lib/groupActivity";

const levelIcon: Record<ActivityLevel, React.ReactNode> = {
    error: <AlertCircle size={16} className="text-error shrink-0" />,
    warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
    info: <Info size={16} className="text-info shrink-0" />,
};

function SubjectBadges({ event }: { event: ActivityRecord }) {
    const subject = event.subject;
    const clientName = typeof event.data?.clientName === "string" ? event.data.clientName : null;
    if (!subject && !clientName) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {clientName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Server size={10} /> {clientName}
                </span>
            )}
            {subject?.containerName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Box size={10} /> {subject.containerName}
                </span>
            )}
            {subject?.imageRef && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Layers size={10} /> {subject.imageRef}
                </span>
            )}
            {subject?.projectName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Boxes size={10} /> {subject.projectName}
                </span>
            )}
        </div>
    );
}

/**
 * The activity list. Still reached under "Notifications" -- the page has kept the name it
 * had, while what it shows has become structured events.
 *
 * Two things follow from that and are visible here: the text of a row is written in
 * `activityText` out of `kind` and `data`, not taken from the event, and a multi-step
 * operation is a group of full events rather than one entry with a list of sentences
 * attached. The filters work on the fields themselves, so "every warning" means exactly
 * that instead of whatever matched a search box.
 */
export function ActivityView() {
    const { events, currentUserId, markSeen, markAllSeen, removeEvent, clearAll } =
        useActivityStore();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [levelFilter, setLevelFilter] = useState<string>("");
    const [kindFilter, setKindFilter] = useState<string>("");

    const groups = useMemo(
        () => groupActivity(events, currentUserId),
        [events, currentUserId],
    );

    // Built from what is actually in the list, so a kind this build does not know still
    // turns up as something you can filter on.
    const kindOptions = useMemo(() => {
        const kinds = [...new Set(events.map((e) => e.kind))].sort();
        return [
            { value: "", label: "All kinds" },
            ...kinds.map((kind) => ({ value: kind, label: kind })),
        ];
    }, [events]);

    const filtered = useMemo(
        () =>
            groups.filter((group) => {
                if (levelFilter && group.level !== levelFilter) return false;
                if (
                    kindFilter &&
                    group.head.kind !== kindFilter &&
                    !group.members.some((m) => m.kind === kindFilter)
                ) {
                    return false;
                }
                return true;
            }),
        [groups, levelFilter, kindFilter],
    );

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** A row is one group, so seeing it means seeing everything under it. */
    const handleMarkSeen = (group: ActivityGroup) => {
        markSeen(group.head.id);
        for (const member of group.members) markSeen(member.id);
    };

    const handleDelete = (group: ActivityGroup) => {
        removeEvent(group.head.id);
        for (const member of group.members) removeEvent(member.id);
    };

    const tableDef: DataTableDef<ActivityGroup>[] = [
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
                const detail = activityDetail(g.head);
                const expandable = !!detail || g.members.length > 0;
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
                                    {activityMessage(g.head)}
                                </p>
                                {g.members.length > 0 && (
                                    <span className="shrink-0 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                                        {g.members.length} step{g.members.length === 1 ? "" : "s"}
                                    </span>
                                )}
                            </div>
                            {isExpanded && detail && (
                                <p className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-words">
                                    {detail}
                                </p>
                            )}
                            {isExpanded && g.members.length > 0 && (
                                <ActivityGroupSteps members={g.members} />
                            )}
                            <SubjectBadges event={g.head} />
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
            tableItemRender: (g) => format(new Date(g.head.occurredAt), "dd.MM.yyyy HH:mm:ss"),
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
                        {
                            icon: Trash2,
                            onClick: () => handleDelete(g),
                            tooltip: "Delete",
                            color: "red" as const,
                        },
                    ]}
                />
            ),
        },
    ];

    const unseenCount = groups.filter((g) => g.unseen).length;

    const extraActions = (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                aria-label="Filter by level"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                options={[
                    { value: "", label: "All levels" },
                    ...ACTIVITY_LEVELS.map((level) => ({ value: level, label: level })),
                ]}
            />
            <Select
                aria-label="Filter by kind"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                options={kindOptions}
            />
            {unseenCount > 0 && (
                <Button variant="secondary" size="sm" onClick={markAllSeen}>
                    Mark all as seen
                </Button>
            )}
            {groups.length > 0 && (
                <Button variant="secondary" size="sm" onClick={clearAll}>
                    Delete all
                </Button>
            )}
        </div>
    );

    return (
        <DataMultiView<ActivityGroup>
            title={
                <>
                    <Bell size={18} className="text-text-muted" /> Notifications
                </>
            }
            viewMode={{ storageKey: "activityView" }}
            data={filtered}
            tableDef={tableDef}
            keyField={(g) => g.head.id}
            // Column 2 is the time. Column 3 is the action column, which has no sort value.
            sort={{ defaultValue: [{ colIndex: 2, direction: "desc" }] }}
            emptyMessage="Nothing has happened yet."
            noResultsMessage="No events match these filters."
            pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
            extraActions={extraActions}
            classNames={{ table: { table: "w-full" } }}
        />
    );
}
