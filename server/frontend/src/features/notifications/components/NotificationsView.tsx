import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronDown,
  Trash2,
  Bell,
} from "lucide-react";
import { DataMultiView, DataTableDef, Button, DataAction } from "@stefgo/react-ui-components";
import {
  useNotificationStore,
  Notification,
  NotificationLevel,
} from "../../../stores/useNotificationStore";
import { format } from "date-fns";

const levelIcon: Record<NotificationLevel, React.ReactNode> = {
  error: <AlertCircle size={16} className="text-red-500 shrink-0" />,
  warning: <AlertTriangle size={16} className="text-yellow-500 shrink-0" />,
  info: <Info size={16} className="text-blue-500 shrink-0" />,
};

export function NotificationsView() {
  const { notifications, removeNotification, clearAll } =
    useNotificationStore();

  const tableDef: DataTableDef<Notification>[] = [
    {
      tableHeader: "",
      tableHeaderClassName: "px-0 pl-6",
      tableCellClassName: "px-0 pl-6",
      tableItemRender: (n) => levelIcon[n.level],
    },
    {
      tableHeader: "Message",
      tableItemRender: (n) => {
        const { toggleExpand: toggle } = useNotificationStore.getState();
        return (
          <div className="flex items-start gap-2 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(n.id);
              }}
              className="mt-0.5 shrink-0 text-text-muted dark:text-text-muted-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors"
              title={n.isExpanded ? "Collapse" : "Expand"}
            >
              {n.isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <div className="w-full">
              <p
                className={`text-sm text-text-primary dark:text-text-primary-dark truncate"}`}
              >
                {n.message}
              </p>
              {n.isExpanded && n.detail && (
                <p className="mt-1 text-xs text-text-muted dark:text-text-muted-dark whitespace-pre-wrap break-words">
                  {n.detail}
                </p>
              )}
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
      sortValue: (n) => n.timestamp.getTime(),
      tableItemRender: (n) => format(n.timestamp, "dd.MM.yyyy HH:mm:ss"),
    },
    {
      tableHeader: "Action",
      tableHeaderClassName: "w-px text-center",
      tableCellClassName: "w-px content-center",
      tableItemRender: (n) => (
        <DataAction
          rowId={n.id}
          actions={[
            {
              icon: Trash2,
              onClick: () => removeNotification(n.id),
              tooltip: "Delete",
              color: "red",
            },
          ]}
        />
      ),
    },
  ];

  const extraActions =
    notifications.length > 0 ? (
      <Button variant="secondary" size="sm" onClick={clearAll}>
        Clear all
      </Button>
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
      emptyMessage="No notifications."
      extraActions={extraActions}
      classNames={{ table: { table: "w-full" } }}
    />
  );
}
