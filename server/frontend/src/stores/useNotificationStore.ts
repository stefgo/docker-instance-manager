import { create } from "zustand";

export type NotificationLevel = "error" | "warning" | "info";

export interface Notification {
  id: string;
  level: NotificationLevel;
  message: string;
  detail?: string;
  timestamp: Date;
  isExpanded: boolean;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (
    level: NotificationLevel,
    message: string,
    detail?: string,
  ) => void;
  removeNotification: (id: string) => void;
  toggleExpand: (id: string) => void;
  clearAll: () => void;
}

/*
const testNotifications: Notification[] = [
  { id: "t1", level: "error", message: "Failed to connect to client docker-host-01: Connection refused", detail: "Error: connect ECONNREFUSED 192.168.1.10:2375\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1187:16)", timestamp: new Date(Date.now() - 1000 * 60 * 2), isExpanded: false },
  { id: "t2", level: "warning", message: "Image update check timed out for nginx:latest on docker-host-02", timestamp: new Date(Date.now() - 1000 * 60 * 5), isExpanded: false },
  { id: "t3", level: "info", message: "Client docker-host-03 reconnected successfully", timestamp: new Date(Date.now() - 1000 * 60 * 8), isExpanded: false },
  { id: "t4", level: "error", message: "Failed to parse token", detail: "SyntaxError: Unexpected token 'u' in JSON at position 0\n    at JSON.parse (<anonymous>)\n    at AppLayout (App.tsx:89:28)", timestamp: new Date(Date.now() - 1000 * 60 * 12), isExpanded: false },
  { id: "t5", level: "warning", message: "Container web-app on docker-host-01 is using more than 90% of its memory limit", timestamp: new Date(Date.now() - 1000 * 60 * 20), isExpanded: false },
  { id: "t6", level: "info", message: "Image postgres:16 updated successfully on 3 hosts", timestamp: new Date(Date.now() - 1000 * 60 * 35), isExpanded: false },
  { id: "t7", level: "error", message: "WebSocket connection lost to docker-host-04", detail: "CloseEvent: code=1006, reason='', wasClean=false\nReconnect attempt 3 of 5 failed.", timestamp: new Date(Date.now() - 1000 * 60 * 47), isExpanded: false },
  { id: "t8", level: "warning", message: "New image digest available for redis:7-alpine — container restart required to apply update", timestamp: new Date(Date.now() - 1000 * 60 * 60), isExpanded: false },
  { id: "t9", level: "info", message: "User admin logged in from 10.0.0.5", timestamp: new Date(Date.now() - 1000 * 60 * 90), isExpanded: false },
  { id: "t10", level: "error", message: "Failed to remove image sha256:a1b2c3d4e5f6 on docker-host-02: image is referenced in multiple repositories", timestamp: new Date(Date.now() - 1000 * 60 * 120), isExpanded: false },
];
*/

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],

  addNotification: (level, message, detail) =>
    set((state) => ({
      notifications: [
        {
          id: crypto.randomUUID(),
          level,
          message,
          detail,
          timestamp: new Date(),
          isExpanded: false,
        },
        ...state.notifications,
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  toggleExpand: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isExpanded: !n.isExpanded } : n,
      ),
    })),

  clearAll: () => set({ notifications: [] }),
}));
