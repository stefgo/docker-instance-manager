import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "../../auth/AuthContext";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useSchedulerStore } from "../../../stores/useSchedulerStore";
import {
  useAutoUpdateStore,
  ManualAutoUpdateEntry,
} from "../../../stores/useAutoUpdateStore";

interface WebSocketContextType {
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  return useContext(WebSocketContext);
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const { token } = useAuth();
  const { setClients } = useClientStore();
  const { setDockerState } = useDockerStore();
  const { setImageUpdateCheckStatus, setContainerAutoUpdateStatus } = useSchedulerStore();
  const { setManualEntries, setLabelFilter, fetchManualEntries } = useAutoUpdateStore();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!token) return;

    let isClosing = false;
    let connectTimeout: any = null;

    const connect = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/dashboard?token=${token}`;

      console.log("Connecting to WebSocket:", wsUrl);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        fetchManualEntries(token);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "CLIENTS_UPDATE") {
            setClients(data.payload);
          }

          if (data.type === "DOCKER_STATE_UPDATE") {
            setDockerState(data.payload.clientId, data.payload.state);
          }

          if (data.type === "SCHEDULER_STATUS_UPDATE") {
            if (data.payload?.imageUpdateCheck) {
              setImageUpdateCheckStatus(data.payload.imageUpdateCheck);
            }
            if (data.payload?.containerAutoUpdate) {
              setContainerAutoUpdateStatus(data.payload.containerAutoUpdate);
            }
          }

          if (data.type === "MANUAL_AUTO_UPDATE_UPDATE") {
            const entries = (data.payload?.entries ?? []) as ManualAutoUpdateEntry[];
            setManualEntries(entries);
            if (typeof data.payload?.labelFilter === "string") {
              setLabelFilter(data.payload.labelFilter);
            }
          }
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      socket.onclose = (event) => {
        if (isClosing) return; // Ignore intentional closure

        console.log("WebSocket disconnected", event.code, event.reason);
        setIsConnected(false);
        socketRef.current = null;

        if (event.code === 4001 || event.code === 4003) {
          console.log("Authentication failed, stopping reconnection attempts");
          return;
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      socket.onerror = (err) => {
        if (isClosing) return; // Ignore errors during intentional closure
        console.error("WebSocket error", err);
        socket.close();
      };
    };

    // Delay initial connection slightly to avoid React Strict Mode noisy double-mount in dev
    connectTimeout = setTimeout(() => {
      if (!isClosing) connect();
    }, 100);

    return () => {
      isClosing = true;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [token, setClients, setDockerState, setImageUpdateCheckStatus, setContainerAutoUpdateStatus, setManualEntries, setLabelFilter, fetchManualEntries]);

  return (
    <WebSocketContext.Provider value={{ isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};
