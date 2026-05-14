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
    REQUEST_STATE_UPDATE: "REQUEST_STATE_UPDATE", // Server → Client: Request full Docker state refresh

    // Server -> Dashboard
    CLIENTS_UPDATE: "CLIENTS_UPDATE",
    DOCKER_STATE_UPDATE: "DOCKER_STATE_UPDATE", // Server → Dashboard: Docker state per client

    // Server -> Dashboard (scheduler)
    SCHEDULER_STATUS_UPDATE: "SCHEDULER_STATUS_UPDATE",
    MANUAL_AUTO_UPDATE_UPDATE: "MANUAL_AUTO_UPDATE_UPDATE",

    // Server -> Dashboard (notifications)
    NOTIFICATIONS_UPDATE: "NOTIFICATIONS_UPDATE",

    // Inbound registration (Server → Client via /ws/register)
    REGISTRATION_REQUEST: "REGISTRATION_REQUEST",   // Server → Client: send secret + authToken
    REGISTRATION_SUCCESS: "REGISTRATION_SUCCESS",   // Client → Server: registration accepted
    REGISTRATION_FAILURE: "REGISTRATION_FAILURE",   // Client → Server: secret mismatch

    // Internal
    ERROR: "ERROR",
} as const;

export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    BUSY: "busy",
};
