import { useNotificationStore, NotificationLevel } from "../../../stores/useNotificationStore";

export function useNotificationsBadge(): {
  count: number;
  level: NotificationLevel | null;
} {
  const notifications = useNotificationStore((s) => s.notifications);
  const count = notifications.length;
  const level: NotificationLevel | null =
    notifications.some((n) => n.level === "error") ? "error" :
    notifications.some((n) => n.level === "warning") ? "warning" :
    count > 0 ? "info" : null;

  return { count, level };
}
