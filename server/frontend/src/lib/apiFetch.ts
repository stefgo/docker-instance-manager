/**
 * Single entry point for authenticated calls to /api/v1.
 *
 * Before this existed, every caller built its own Authorization header and checked only
 * `res.ok`. Nothing anywhere looked at 401, so once the server refused the JWT the app
 * kept believing it was logged in and every action failed with a generic "Failed to ..."
 * message -- no logout, no redirect, no hint about what had happened.
 */

/** Thrown on 401 so callers can tell an expired session from a real request error. */
export class SessionExpiredError extends Error {
    constructor() {
        super("Session expired");
        this.name = "SessionExpiredError";
    }
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Lets AuthProvider hand over its logout. The session lives in React context, which a
 * plain module cannot read -- so instead of turning auth into a store, the provider
 * registers the one callback this module needs.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
    onUnauthorized = handler;
}

export const TOKEN_STORAGE_KEY = "token";

function readToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * fetch() with the bearer token attached and a single, central reaction to 401.
 *
 * Only for endpoints behind the JWT. /api/login and /api/auth/config are unauthenticated
 * and deliberately keep using plain fetch -- routing them through here would turn a
 * wrong password into a logout-and-redirect instead of an error message.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = readToken();
    const headers = new Headers(init.headers);
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401) {
        // Drop the dead session and get the user back to the login page. Throwing
        // afterwards keeps callers from treating the 401 body as a valid response.
        onUnauthorized?.();
        throw new SessionExpiredError();
    }

    return res;
}
