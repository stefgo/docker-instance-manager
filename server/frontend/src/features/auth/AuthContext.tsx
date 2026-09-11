import { createContext, useCallback, useContext, ReactNode, useEffect, useState } from "react";

interface AuthContextType {
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

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
        const stored = localStorage.getItem("token");
        if (isTokenUsable(stored)) return stored;
        localStorage.removeItem("token");
        return null;
    });

    // Both memoised: Login.tsx keeps login in an effect's dependency array, so an
    // unstable identity re-ran that effect on every render.
    const login = useCallback((newToken: string) => {
        setToken(newToken);
        localStorage.setItem("token", newToken);
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        localStorage.removeItem("token");
    }, []);

    // Nothing else in the frontend handles a 401 yet, so an expired session would leave
    // every request failing silently. Logging out when the token expires sends the user
    // back to the login page instead.
    useEffect(() => {
        if (!token) return;
        const expiry = getTokenExpiry(token);
        if (expiry === null) return;
        const delay = expiry - Date.now();
        if (delay > MAX_TIMER_MS) return;
        const timer = setTimeout(() => {
            setToken(null);
            localStorage.removeItem("token");
        }, Math.max(delay, 0));
        return () => clearTimeout(timer);
    }, [token]);

    return (
        <AuthContext.Provider value={{ token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
