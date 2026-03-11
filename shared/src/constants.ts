export const WS_EVENTS = {
    // Client -> Server
    AUTH: "AUTH",

    // Server -> Client
    AUTH_SUCCESS: "AUTH_SUCCESS",
    AUTH_FAILURE: "AUTH_FAILURE",

    GET_VERSION: "GET_VERSION", // Client <-> Server

    // Internal
    ERROR: "ERROR",
} as const;

export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    BUSY: "busy",
};
