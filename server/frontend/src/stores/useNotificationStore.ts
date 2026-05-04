import { create } from "zustand";
import { Notification, NotificationLevel } from "@dim/shared";

export type { NotificationLevel, Notification };

interface NotificationState {
  notifications: Notification[];
  currentUserId: string | null;
  setCurrentUserId: (id: string) => void;
  setNotifications: (notifications: Notification[]) => void;
  fetchNotifications: (token: string) => Promise<void>;
  markSeen: (id: string, token: string) => Promise<void>;
  markAllSeen: (token: string) => Promise<void>;
  removeNotification: (id: string, token: string) => Promise<void>;
  clearAll: (token: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  currentUserId: null,

  setCurrentUserId: (id) => set({ currentUserId: id }),

  setNotifications: (notifications) => set({ notifications }),

  fetchNotifications: async (token) => {
    const res = await fetch("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      set({ notifications: data });
    }
  },

  markSeen: async (id, token) => {
    await fetch(`/api/v1/notifications/${id}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  markAllSeen: async (token) => {
    await fetch("/api/v1/notifications/seen-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  removeNotification: async (id, token) => {
    await fetch(`/api/v1/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  clearAll: async (token) => {
    await fetch("/api/v1/notifications", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
}));
