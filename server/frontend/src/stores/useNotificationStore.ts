import { create } from "zustand";
import { Notification, NotificationLevel } from "@dim/shared";
import { apiFetch } from "../lib/apiFetch";

export type { NotificationLevel, Notification };

interface NotificationState {
    notifications: Notification[];
    /** From the JWT, where `id` is a number -- and so are the entries of `seenBy`. */
    currentUserId: number | null;
    setCurrentUserId: (id: number) => void;
    setNotifications: (notifications: Notification[]) => void;
    fetchNotifications: () => Promise<void>;
    markSeen: (id: string) => Promise<void>;
    markAllSeen: () => Promise<void>;
    removeNotification: (id: string) => Promise<void>;
    clearAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
    notifications: [],
    currentUserId: null,

    setCurrentUserId: (id) => set({ currentUserId: id }),

    setNotifications: (notifications) => set({ notifications }),

    fetchNotifications: async () => {
        const res = await apiFetch("/api/v1/notifications");
        if (res.ok) {
            const data = await res.json();
            set({ notifications: data });
        }
    },

    markSeen: async (id) => {
        const userId = get().currentUserId;
        if (userId) {
            set((s) => ({
                notifications: s.notifications.map((n) =>
                    n.id === id && !n.seenBy.includes(userId)
                        ? { ...n, seenBy: [...n.seenBy, userId] }
                        : n
                ),
            }));
        }
        await apiFetch(`/api/v1/notifications/${id}/seen`, { method: "POST" });
    },

    markAllSeen: async () => {
        const userId = get().currentUserId;
        if (userId) {
            set((s) => ({
                notifications: s.notifications.map((n) =>
                    n.seenBy.includes(userId) ? n : { ...n, seenBy: [...n.seenBy, userId] }
                ),
            }));
        }
        await apiFetch("/api/v1/notifications/seen-all", { method: "POST" });
    },

    removeNotification: async (id) => {
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
        await apiFetch(`/api/v1/notifications/${id}`, { method: "DELETE" });
    },

    clearAll: async () => {
        set({ notifications: [] });
        await apiFetch("/api/v1/notifications", { method: "DELETE" });
    },
}));
