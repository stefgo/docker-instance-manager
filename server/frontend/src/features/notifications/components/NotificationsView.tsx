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
import { DataMultiView, DataTableDef, Button, DataAction } from "@stefgo/react-ui-components";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { Notification, NotificationLevel } from "@dim/shared";
import { useAuth } from "../../auth/AuthContext";
import { format } from "date-fns";

const levelIcon: Record<NotificationLevel, React.ReactNode> = {
  error: <AlertCircle size={16} className="text-red-500 shrink-0" />,
  warning: <AlertTriangle size={16} className="text-yellow-500 shrink-0" />,
  info: <Info size={16} className="text-blue-500 shrink-0" />,
};

function ContextBadges({ notification }: { notification: Notification }) {
  const ctx = notification.context;
  if (!ctx) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ctx.clientName && (
        <span className="inline-flex items-center gap-1 text-[11px] bg-surface-elevated dark:bg-surface-elevated-dark px-1.5 py-0.5 rounded text-text-muted dark:text-text-muted-dark">
          <Server size={10} /> {ctx.clientName}
        </span>
      )}
      {ctx.containerName && (
        <span className="inline-flex items-center gap-1 text-[11px] bg-surface-elevated dark:bg-surface-elevated-dark px-1.5 py-0.5 rounded text-text-muted dark:text-text-muted-dark">
          <Box size={10} /> {ctx.containerName}
        </span>
      )}
      {ctx.imageName && (
        <span className="inline-flex items-center gap-1 text-[11px] bg-surface-elevated dark:bg-surface-elevated-dark px-1.5 py-0.5 rounded text-text-muted dark:text-text-muted-dark">
          <Layers size={10} /> {ctx.imageName}
        </span>
      )}
    </div>
  );
}

export function NotificationsView() {
  const { notifications, currentUserId, markSeen, markAllSeen, removeNotification, clearAll } =
    useNotificationStore();
  const { token } = useAuth();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const isSeen = (n: Notification) =>
    currentUserId ? n.seenBy.includes(currentUserId) : false;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMarkSeen = (id: string) => {
    if (token) markSeen(id, token);
  };

  const handleMarkAllSeen = () => {
    if (token) markAllSeen(token);
  };

  const handleDelete = (id: string) => {
    if (token) removeNotification(id, token);
  };

  const handleClearAll = () => {
    if (token) clearAll(token);
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
        return (
          <div className={`flex items-start gap-2 w-full ${seen ? "opacity-60" : ""}`}>
            <div className="mt-0.5 shrink-0 w-[14px]">
              {n.detail && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(n.id);
                  }}
                  className="text-text-muted dark:text-text-muted-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors"
                  title={isExpanded ? "Einklappen" : "Ausklappen"}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              )}
            </div>
            <div className="w-full min-w-0">
              <p className={`text-sm text-text-primary dark:text-text-primary-dark truncate ${seen ? "" : "font-medium"}`}>
                {n.message}
              </p>
              {isExpanded && n.detail && (
                <p className="mt-1 text-xs text-text-muted dark:text-text-muted-dark whitespace-pre-wrap break-words">
                  {n.detail}
                </p>
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
      tableCellClassName: "w-px whitespace-nowrap text-sm text-text-muted dark:text-text-muted-dark",
      sortable: true,
      sortValue: (n) => new Date(n.createdAt).getTime(),
      tableItemRender: (n) => format(new Date(n.createdAt), "dd.MM.yyyy HH:mm:ss"),
    },
    {
      tableHeader: "Action",
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
                  tooltip: "Als gesehen markieren",
                  color: "blue" as const,
                }]
              : [{
                  icon: EyeOff,
                  onClick: () => {},
                  tooltip: "Bereits gesehen",
                  color: "gray" as const,
                }]),
            {
              icon: Trash2,
              onClick: () => handleDelete(n.id),
              tooltip: "Löschen",
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
          Alle als gesehen
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={handleClearAll}>
        Alle löschen
      </Button>
    </div>
  ) : null;

  return (
    <DataMultiView<Notification>
      title={
        <>
          <Bell size={18} className="text-text-muted dark:text-text-muted-dark" /> Notifications
        </>
      }
      viewModeStorageKey="notificationsView"
      data={notifications}
      tableDef={tableDef}
      keyField="id"
      defaultSort={{ colIndex: 3, direction: "desc" }}
      emptyMessage="Keine Benachrichtigungen."
      extraActions={extraActions}
      classNames={{ table: { table: "w-full" } }}
    />
  );
}
