import { z } from "zod";
import { CLIENT_STATUS, CONNECTION_MODE } from "./constants.js";

export const ClientSchema = z.object({
    id: z.uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(CLIENT_STATUS),
    lastSeen: z.string(),
    version: z.string().optional(),
    connectionMode: z.enum(CONNECTION_MODE).optional(),
    inboundRegisteredIp: z.string().optional(),
    outboundTargetAddress: z.string().optional(),
});

/**
 * What an agent sends to `POST /api/v1/register`. It brings no identity of its own: the
 * server issues both `clientId` and the auth token and returns them below.
 */
export const RegistrationPayloadSchema = z.object({
    token: z.string(),
    hostname: z.string().optional(),
});

/** The identity the server issues. The agent stores both values in its config.yaml. */
export const RegistrationResponseSchema = z.object({
    token: z.string(),
    clientId: z.string(),
});

export const TokenSchema = z.object({
    token: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    usedAt: z.string().optional(),
});

// WS Payloads schemas

export const AuthPayloadSchema = z.object({
    hostname: z.string(),
    version: z.string().optional(),
});
