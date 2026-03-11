import { z } from "zod";
import {
    ClientSchema,
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    TokenSchema,
    AuthPayloadSchema,
} from "./schemas.js";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export type Client = z.infer<typeof ClientSchema>;
export type Token = z.infer<typeof TokenSchema>;

// WS Payloads
export type AuthPayload = z.infer<typeof AuthPayloadSchema>;

export interface WsMessage<T = any> {
    type: string;
    payload: T;
}

export interface ProtocolMap {
    AUTH: {
        req: AuthPayload;
        res: void;
    };
    AUTH_SUCCESS: {
        req: void;
        res: { lastSyncTime?: string | null };
    };
    AUTH_FAILURE: {
        req: { error?: string };
        res: void;
    };
}
