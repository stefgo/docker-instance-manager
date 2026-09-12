import { useState } from "react";
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
} from "lucide-react";
import { ActionButton, Button, DataAction, DataMultiView, DataTableDef } from "@stefgo/react-ui-components";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { Notification, NotificationLevel } from "@dim/shared";
import { NotificationSteps } from "./NotificationSteps";
import { format } from "date-fns";

const levelIcon: Record<NotificationLevel, React.ReactNode> = {
    error: <AlertCircle size={16} className="text-error shrink-0" />,
    warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
    info: <Info size={16} className="text-info shrink-0" />,
};

function ContextBadges({ notification }: { notification: Notification }) {
    const ctx = notification.context;
    if (!ctx) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {ctx.clientName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Server size={10} /> {ctx.clientName}
                </span>
            )}
            {ctx.containerName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Box size={10} /> {ctx.containerName}
                </span>
            )}
            {ctx.imageName && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                    <Layers size={10} /> {ctx.imageName}
                </span>
            )}
        </div>
    );
}

export function NotificationsView() {
    const { notifications, currentUserId, markSeen, markAllSeen, removeNotification, clearAll } =
        useNotificationStore();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const isSeen = (n: Notification) =>
        currentUserId ? n.seenBy.includes(currentUserId) : false;

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleMarkSeen = (id: string) => {
        markSeen(id);
    };

    const handleMarkAllSeen = () => {
        markAllSeen();
    };

    const handleDelete = (id: string) => {
        removeNotification(id);
    };

    const handleClearAll = () => {
        clearAll();
    };

    const tableDef: DataTableDef<Notification>[] = [
        {
            tableHeader: "",
            tableHeaderClassName: "px-0 pl-6 w-px",
            tableCellClassName: "px-0 pl-6 w-px",
            tableItemRender: (n) => levelIcon[n.level],
        },
        {
            tableHeader: "Message",
            tableItemRender: (n) => {
                const isExpanded = expandedIds.has(n.id);
                const seen = isSeen(n);
                const stepCount = n.steps?.length ?? 0;
                const expandable = !!n.detail || stepCount > 0;
                return (
                    <div className={`flex items-start gap-2 w-full ${seen ? "opacity-60" : ""}`}>
                        <div className="mt-0.5 shrink-0 w-[14px]">
                            {expandable && (
                                <ActionButton
                                    icon={isExpanded ? ChevronDown : ChevronRight}
                                    size="sm"
                                    tooltip={isExpanded ? "Collapse" : "Expand"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpand(n.id);
                                    }}
                                />
                            )}
                        </div>
                        <div className="w-full min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <p className={`text-sm text-text-primary truncate ${seen ? "" : "font-medium"}`}>
                                    {n.message}
                                </p>
                                {stepCount > 1 && (
                                    <span className="shrink-0 text-[11px] bg-hover px-1.5 py-0.5 rounded text-text-muted">
                                        {stepCount} steps
                                    </span>
                                )}
                            </div>
                            {isExpanded && n.detail && (
                                <p className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-words">
                                    {n.detail}
                                </p>
                            )}
                            {isExpanded && n.steps && n.steps.length > 0 && (
                                <NotificationSteps steps={n.steps} />
                            )}
                            <ContextBadges notification={n} />
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
            sortValue: (n) => new Date(n.createdAt).getTime(),
            tableItemRender: (n) => format(new Date(n.createdAt), "dd.MM.yyyy HH:mm:ss"),
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "w-px text-center",
            tableCellClassName: "w-px content-center",
            tableItemRender: (n) => (
                <DataAction
                    rowId={n.id}
                    actions={[
                        ...(!isSeen(n)
                            ? [{
                                    icon: Eye,
                                    onClick: () => handleMarkSeen(n.id),
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
                            onClick: () => handleDelete(n.id),
                            tooltip: "Delete",
                            color: "red" as const,
                        },
                    ]}
                />
            ),
        },
    ];

    const unseenCount = currentUserId
        ? notifications.filter((n) => !n.seenBy.includes(currentUserId)).length
        : notifications.length;

    const extraActions = notifications.length > 0 ? (
        <div className="flex gap-2">
            {unseenCount > 0 && (
                <Button variant="secondary" size="sm" onClick={handleMarkAllSeen}>
                    Mark all as seen
                </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleClearAll}>
                Delete all
            </Button>
        </div>
    ) : null;

    return (
        <DataMultiView<Notification>
            title={
                <>
                    <Bell size={18} className="text-text-muted" /> Notifications
                </>
            }
            viewMode={{ storageKey: "notificationsView" }}
            data={notifications}
            tableDef={tableDef}
            keyField="id"
            // Column 2 is the time. The 3 this used to name is the action column, which has no
            // sort value, so the default sort never took effect.
            sort={{ defaultValue: [{ colIndex: 2, direction: "desc" }] }}
            emptyMessage="No notifications."
            pagination={{ defaultValue: { pageSize: 20 }, hideOnSinglePage: true }}
            extraActions={extraActions}
            classNames={{ table: { table: "w-full" } }}
        />
    );
}
