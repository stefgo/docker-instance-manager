import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { getErrorMessage } from "../../../utils";

interface UserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    username: string;
    password?: string;
    auth_methods?: string;
  }) => Promise<void>;
  editingUser: { id: number; username: string; auth_methods?: string } | null;
}

export const UserDialog = ({
  isOpen,
  onClose,
  onSave,
  editingUser,
}: UserDialogProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMethods, setAuthMethods] = useState<string[]>(["local"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setUsername(editingUser.username);
        setPassword(""); // Don't show existing hash
        setAuthMethods(
          editingUser.auth_methods
            ? editingUser.auth_methods.split(",")
            : ["local"],
        );
      } else {
        setUsername("");
        setPassword("");
        setAuthMethods(["local"]);
      }
      setError(null);
    }
  }, [isOpen, editingUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError("Username is required");
      return;
    }

    // Simpler check:
    // New user with local: required.
    // Existing user adding local: required.
    // Existing user keeping local: optional.

    const previouslyHadLocal =
      editingUser && (editingUser.auth_methods || "local").includes("local");
    const nowHasLocal = authMethods.includes("local");

    if (nowHasLocal && !password && !previouslyHadLocal) {
      setError("Password is required when enabling local authentication");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onSave({
        username,
        password: password || undefined,
        auth_methods: authMethods.join(","),
      });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAuthMethod = (method: string) => {
    setAuthMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method],
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-app-card rounded-xl border border-gray-200 dark:border-app-border shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold dark:text-white text-gray-900">
            {editingUser ? "Edit User" : "New User"}
          </h3>
          <button
            onClick={onClose}
            className="text-app-text-muted hover:text-gray-700 dark:hover:text-app-text-main transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-app-text-muted mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!!editingUser} // Prevent changing username for now
              className={`w-full px-3 py-2 bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded-lg focus:outline-none focus:ring-2 focus:ring-app-accent/50 dark:text-app-text-main ${editingUser ? "opacity-60 cursor-not-allowed" : ""}`}
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-app-text-muted mb-2">
              Authentication Methods
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authMethods.includes("local")}
                  onChange={() => toggleAuthMethod("local")}
                  className="rounded border-gray-300 dark:border-app-border text-app-accent focus:ring-app-accent bg-app-input"
                />
                <span className="text-sm text-gray-700 dark:text-app-text-muted">
                  Local (Password)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authMethods.includes("oidc")}
                  onChange={() => toggleAuthMethod("oidc")}
                  className="rounded border-gray-300 dark:border-app-border text-app-accent focus:ring-app-accent bg-app-input"
                />
                <span className="text-sm text-gray-700 dark:text-app-text-muted">
                  OIDC (SSO)
                </span>
              </label>
            </div>
          </div>

          {authMethods.includes("local") && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="block text-sm font-medium text-gray-700 dark:text-app-text-muted mb-1">
                {editingUser
                  ? "New Password (leave blank to keep current)"
                  : "Password"}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded-lg focus:outline-none focus:ring-2 focus:ring-app-accent/50 dark:text-app-text-main"
                placeholder={editingUser ? "••••••••" : "password"}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-app-text-muted hover:bg-gray-100 dark:hover:bg-app-input rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg disabled:opacity-50 transition-colors font-medium shadow-glow-accent"
            >
              {isLoading ? "Saving..." : "Save User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
