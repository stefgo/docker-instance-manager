import { useEffect, useRef, useState, ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext";
import { WebSocketContext } from "./WebSocketContext";
import { WS_EVENTS } from "@dim/shared";
import { queryClient } from "../../../lib/queryClient";
import { assertNever, createDashboardMessageReader } from "../lib/dashboardMessages";
import { isPushedOnConnect } from "../../../lib/queryKeys";
import { appendActivity, applySchedulerUpdate, markActivitySeen } from "../../../lib/cacheUpdates";
import { activityListOptions } from "../../../queries/activity";
import { autoUpdateLabelOptions } from "../../../queries/autoUpdate";
import { clientListOptions } from "../../../queries/clients";
import { setDockerState } from "../../../queries/docker";
import { projectListOptions } from "../../../queries/projects";
import { schedulerStatusOptions } from "../../../queries/scheduler";

/** Module scope, so "reported once" holds across reconnects and not per socket. */
const readMessage = createDashboardMessageReader();

interface WebSocketProviderProps {
    children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
    const { isAuthenticated } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isAuthenticated) return;

        let isClosing = false;
        let connectTimeout: ReturnType<typeof setTimeout> | null = null;
        // Per effect run: a login after a logout is a first connection again, not a resync.
        let hasConnected = false;

        const connect = () => {
            if (socketRef.current?.readyState === WebSocket.OPEN) return;

            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            // No token in the URL: the browser attaches the session cookie to the handshake
            // by itself. As a query parameter the JWT went into every access log on the way.
            const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;

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
                // What the server pushed while the socket was down is lost. The client
                // list, the Docker states and the activity come again with this connect;
                // everything else on screen is read again, the rest marked stale and read
                // when it is next shown. On the first connect there is nothing to make up
                // for: whatever a page needs, its query reads.
                if (hasConnected) {
                    void queryClient.invalidateQueries({ predicate: (query) => !isPushedOnConnect(query.queryKey) });
                }
                hasConnected = true;
            };

            socket.onmessage = (event) => {
                // Parsed against the contract in @dim/shared; what does not match is
                // dropped and reported once per type (see lib/dashboardMessages.ts).
                const message = readMessage(event.data);
                if (!message) return;

                switch (message.type) {
                    // The whole list, so it may also be what fills the entry first.
                    case WS_EVENTS.CLIENTS_UPDATE:
                        queryClient.setQueryData(clientListOptions.queryKey, message.payload);
                        break;

                    case WS_EVENTS.DOCKER_STATE_UPDATE:
                        setDockerState(message.payload.clientId, message.payload.state);
                        break;

                    // Nothing to do: the request that asked for the action gets the same
                    // result as its own answer and reports it there, and what the action
                    // changed on the host arrives as a DOCKER_STATE_UPDATE.
                    case WS_EVENTS.DOCKER_ACTION_RESULT:
                        break;

                    // One scheduler at a time. Only where the status has been read: an
                    // entry made here would hold one scheduler and pass for all four.
                    case WS_EVENTS.SCHEDULER_STATUS_UPDATE:
                        queryClient.setQueryData(
                            schedulerStatusOptions.queryKey,
                            (schedulers) => schedulers && applySchedulerUpdate(schedulers, message.payload),
                        );
                        break;

                    case WS_EVENTS.AUTO_UPDATE_LABEL_UPDATE:
                        queryClient.setQueryData(autoUpdateLabelOptions.queryKey, message.payload.labelFilter);
                        break;

                    case WS_EVENTS.PROJECTS_UPDATE:
                        queryClient.setQueryData(projectListOptions.queryKey, message.payload.projects);
                        break;

                    // The whole list: on connect, and empty after "Delete all".
                    case WS_EVENTS.ACTIVITY_UPDATE:
                        queryClient.setQueryData(activityListOptions.queryKey, message.payload);
                        break;

                    // Only onto a list that is there: the events alone would pass for all
                    // of it. The list itself arrives with the connect, before any of these.
                    case WS_EVENTS.ACTIVITY_APPENDED:
                        queryClient.setQueryData(
                            activityListOptions.queryKey,
                            (events) => events && appendActivity(events, message.payload),
                        );
                        break;

                    case WS_EVENTS.ACTIVITY_SEEN:
                        queryClient.setQueryData(
                            activityListOptions.queryKey,
                            (events) => events && markActivitySeen(events, message.payload.ids),
                        );
                        break;

                    // Does not compile while a member of DashboardMessage has no case above.
                    default:
                        assertNever(message);
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
    }, [isAuthenticated]);

    return (
        <WebSocketContext.Provider value={{ isConnected }}>
            {children}
        </WebSocketContext.Provider>
    );
};
