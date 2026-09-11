import { useCallback, ReactNode, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import { setUnauthorizedHandler, TOKEN_STORAGE_KEY } from "../../lib/apiFetch";

interface AuthProviderProps {
    children: ReactNode;
}

/** setTimeout stores its delay as a signed 32-bit integer; longer delays fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Returns the token's expiry in milliseconds, or null if it has none or cannot be read.
 * The payload is base64url, which atob only accepts after mapping it back to base64.
 */
const getTokenExpiry = (token: string): number | null => {
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const { exp } = JSON.parse(atob(payload));
        return typeof exp === "number" ? exp * 1000 : null;
    } catch {
        return null;
    }
};

/**
 * A token without exp was issued before the server started signing expiring tokens and
 * is now refused by it, so it is treated like an expired one.
 */
const isTokenUsable = (token: string | null): token is string => {
    if (!token) return false;
    const expiry = getTokenExpiry(token);
    return expiry !== null && expiry > Date.now();
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [token, setToken] = useState<string | null>(() => {
        const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (isTokenUsable(stored)) return stored;
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
    });

    // Both memoised: Login.tsx keeps login in an effect's dependency array, so an
    // unstable identity re-ran that effect on every render.
    const login = useCallback((newToken: string) => {
        setToken(newToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    }, []);

    // apiFetch is a plain module and cannot read this context, so it gets handed the one
    // thing it needs: what to do when the server says the session is over. Clearing the
    // token re-renders the router into the login route.
    useEffect(() => {
        setUnauthorizedHandler(logout);
        return () => setUnauthorizedHandler(null);
    }, [logout]);

    // A 401 only arrives with the next request. An open dashboard fed by the WebSocket
    // may not send one for a long time, so the expiry is also acted on when it comes.
    useEffect(() => {
        if (!token) return;
        const expiry = getTokenExpiry(token);
        if (expiry === null) return;
        const delay = expiry - Date.now();
        if (delay > MAX_TIMER_MS) return;
        const timer = setTimeout(logout, Math.max(delay, 0));
        return () => clearTimeout(timer);
    }, [token, logout]);

    return (
        <AuthContext.Provider value={{ token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
