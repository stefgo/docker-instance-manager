import { Notification, NotificationContext, NotificationLevel, NotificationStep, WS_EVENTS } from "@dim/shared";
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
        steps?: NotificationStep[],
    ): Notification {
        const notification = NotificationRepository.create(level, message, detail, context, steps);
        broadcast(NotificationRepository.list());
        return notification;
    }

    /**
     * Adds steps to a notification that stands for a still-running operation. Steps that
     * arrive after the operation reported its result land here, so the dashboard sees the
     * entry grow instead of getting a second notification.
     */
    static appendSteps(id: string, steps: NotificationStep[]): boolean {
        const ok = NotificationRepository.appendSteps(id, steps);
        if (ok) broadcast(NotificationRepository.list());
        return ok;
    }

    static markSeen(id: string, userId: number): boolean {
        const ok = NotificationRepository.markSeen(id, userId);
        if (ok) broadcast(NotificationRepository.list());
        return ok;
    }

    static markAllSeen(userId: number): void {
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
