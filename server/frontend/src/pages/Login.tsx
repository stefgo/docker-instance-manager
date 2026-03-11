import { useState, FormEvent, useEffect } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { getErrorMessage } from "../utils";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [authType, setAuthType] = useState<"local" | "oidc" | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      login(token);
    }
  }, [searchParams, login]);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((res) => res.json())
      .then((data) => setAuthType(data.type))
      .catch(() => setAuthType("local"));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Login failed");

      login(data.token);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/login";
  };

  if (authType === null) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg p-4 text-app-text-main font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-app-input/40 via-app-bg to-black opacity-70 z-0"></div>

      <div className="w-full max-w-md glass-card relative z-10 overflow-hidden animate-fade-in shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-app-accent to-app-accent-hover"></div>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-app-input to-app-bg mb-4 shadow-inner border border-white/5 animate-pulse-soft">
              <Lock className="w-10 h-10 text-app-accent drop-shadow-glow-accent animate-pulse-glow" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-1">
              Proxmox <span className="text-app-accent">Backup</span>
            </h2>
            <p className="text-app-text-muted text-xs uppercase tracking-[0.3em] font-bold opacity-80">
              Client Manager
            </p>
          </div>

          {authType === "oidc" ? (
            <div className="space-y-6">
              <div className="bg-app-input border border-app-border rounded-lg p-6 text-center">
                <ShieldCheck className="w-12 h-12 text-app-accent mx-auto mb-4" />
                <h3 className="text-lg font-medium text-app-text-main mb-2">
                  Single Sign-On Enabled
                </h3>
                <p className="text-app-text-muted text-sm mb-6">
                  Please log in using your identity provider.
                </p>

                <button
                  onClick={handleOidcLogin}
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent transition-all shadow-glow-accent hover:shadow-app-accent/20 active:scale-[0.98]"
                >
                  Login with OIDC
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-900/20 border border-red-800/50 text-red-200 text-sm p-4 rounded-lg flex items-start gap-3 animate-pulse-soft">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="group">
                  <label className="block text-xs font-semibold text-app-text-muted uppercase mb-1.5 ml-1 group-focus-within:text-app-accent transition-colors">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-app-text-footer group-focus-within:text-app-accent transition-colors" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-app-input border border-app-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-app-accent/50 focus:border-app-accent transition-all sm:text-sm"
                      placeholder="Enter your username"
                      required
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs font-semibold text-app-text-muted uppercase mb-1.5 ml-1 group-focus-within:text-app-accent transition-colors">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-app-text-footer group-focus-within:text-app-accent transition-colors" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-app-input border border-app-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-app-accent/50 focus:border-app-accent transition-all sm:text-sm"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-accent hover:shadow-app-accent/20 active:scale-[0.98]"
              >
                {isLoading ? "Signing in..." : "Sign in to Dashboard"}
                {!isLoading && (
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="absolute bottom-6 text-app-text-footer text-xs">
        © {new Date().getFullYear()} Proxmox Server Solutions GmbH. Unofficial
        Client Manager.
      </div>
    </div>
  );
}
