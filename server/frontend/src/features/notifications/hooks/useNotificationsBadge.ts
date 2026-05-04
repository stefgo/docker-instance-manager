import { useNotificationStore } from "../../../stores/useNotificationStore";
import { NotificationLevel } from "@dim/shared";

export function useNotificationsBadge(): {
  count: number;
  level: NotificationLevel | null;
} {
  const notifications = useNotificationStore((s) => s.notifications);
  const currentUserId = useNotificationStore((s) => s.currentUserId);

  const unseen = currentUserId
    ? notifications.filter((n) => !n.seenBy.includes(currentUserId))
    : notifications;

  const count = unseen.length;
  const level: NotificationLevel | null =
    unseen.some((n) => n.level === "error") ? "error" :
    unseen.some((n) => n.level === "warning") ? "warning" :
    count > 0 ? "info" : null;

  return { count, level };
}
