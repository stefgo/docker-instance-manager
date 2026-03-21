export const WS_EVENTS = {
    // Client -> Server
    AUTH: "AUTH",
    DOCKER_UPDATE: "DOCKER_UPDATE",        // Client → Server: Docker state snapshot
    DOCKER_ACTION_RESULT: "DOCKER_ACTION_RESULT", // Client → Server: Action result

    // Server -> Client (Agent)
    AUTH_SUCCESS: "AUTH_SUCCESS",
    AUTH_FAILURE: "AUTH_FAILURE",
    DOCKER_ACTION: "DOCKER_ACTION",        // Server → Client: Trigger a Docker action

    GET_VERSION: "GET_VERSION", // Client <-> Server

    // Server -> Dashboard
    CLIENTS_UPDATE: "CLIENTS_UPDATE",
    DOCKER_STATE_UPDATE: "DOCKER_STATE_UPDATE", // Server → Dashboard: Docker state per client

    // Internal
    ERROR: "ERROR",
} as const;

export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    BUSY: "busy",
};
