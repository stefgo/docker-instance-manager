import { useEffect } from "react";
import { useNotificationStore } from "../../../stores/useNotificationStore";

export function useConsoleErrorCapture() {
  useEffect(() => {
    const addNotification = useNotificationStore.getState().addNotification;
    const originalError = console.error;
    let capturing = false;

    console.error = (...args: unknown[]) => {
      originalError(...args);
      if (capturing) return;
      capturing = true;
      try {
        const message = args
          .map((a) => {
            if (typeof a === "string") return a;
            if (a instanceof Error) return a.message;
            try {
              return String(a);
            } catch {
              return "[unknown]";
            }
          })
          .join(" ");
        const detail =
          args
            .map((a) => (a instanceof Error && a.stack ? a.stack : null))
            .filter(Boolean)
            .join("\n") || undefined;
        addNotification("error", message, detail);
      } finally {
        capturing = false;
      }
    };

    return () => {
      console.error = originalError;
    };
  }, []);
}
