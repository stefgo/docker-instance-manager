import { z } from "zod";

export const ClientSchema = z.object({
    id: z.uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(["online", "offline"]),
    lastSeen: z.string(),
    version: z.string().optional(),
});

export const RegistrationPayloadSchema = z.object({
    token: z.string(),
    clientId: z.string(),
    hostname: z.string().optional(),
});

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
