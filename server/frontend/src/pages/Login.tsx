import { useState, useEffect } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { AuthConfigSchema } from "@dim/shared";
import { publicApi } from "../lib/api";
import { getErrorMessage } from "../utils";
import { LoginPage, useTheme } from "@stefgo/react-ui-components";

export default function Login() {
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [authType, setAuthType] = useState<"local" | "oidc" | null>(null);
    const { login } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // The OIDC return used to land here as /login?token=<JWT>. The server now sets the
    // session cookie itself and redirects to "/", so there is nothing to read from the URL.

    useEffect(() => {
        // Falls back to the form: without an answer there is no telling whether OIDC is
        // configured, and a local login is what every installation has.
        publicApi
            .get("/api/auth/config", AuthConfigSchema)
            .then((config) => setAuthType(config.type))
            .catch(() => setAuthType("local"));
    }, []);

    const handleLogin = async (username: string, password: string) => {
        setError("");
        setIsLoading(true);
        try {
            // The public client, and on purpose: a 401 from /api/login means a wrong
            // password, not an expired session. See the note in lib/api.ts.
            await publicApi.post("/api/login", { username, password }, undefined, { fallback: "Login failed" });
            // No token to pass on: the server has set the session cookies on this response.
            login();
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LoginPage
            title="Docker"
            titleHighlight="Instance"
            subtitle="Manager"
            authType={authType}
            error={error}
            isLoading={isLoading}
            onLogin={handleLogin}
            onOidcLogin={() => { window.location.href = "/api/auth/login"; }}
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
}
