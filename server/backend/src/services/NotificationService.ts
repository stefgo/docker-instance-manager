import { Notification, NotificationContext, NotificationLevel, WS_EVENTS } from "@dim/shared";
import { NotificationRepository } from "../repositories/NotificationRepository.js";
import { ProxyService } from "./ProxyService.js";

function broadcast(notifications: Notification[]) {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.NOTIFICATIONS_UPDATE,
        payload: notifications,
    });
}

export class NotificationService {
    static list(): Notification[] {
        return NotificationRepository.list();
    }

    static create(
        level: NotificationLevel,
        message: string,
        detail?: string,
        context?: NotificationContext,
    ): Notification {
        const notification = NotificationRepository.create(level, message, detail, context);
        broadcast(NotificationRepository.list());
        return notification;
    }

    static markSeen(id: string, userId: string): boolean {
        const ok = NotificationRepository.markSeen(id, userId);
        if (ok) broadcast(NotificationRepository.list());
        return ok;
    }

    static markAllSeen(userId: string): void {
        NotificationRepository.markAllSeen(userId);
        broadcast(NotificationRepository.list());
    }

    static delete(id: string): boolean {
        const ok = NotificationRepository.delete(id);
        if (ok) broadcast(NotificationRepository.list());
        return ok;
    }

    static deleteAll(): void {
        NotificationRepository.deleteAll();
        broadcast([]);
    }
}
