import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { getErrorMessage } from "../../../utils";
import { Card, Input, Button } from "@stefgo/react-ui-components";

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
      <Card
        title={editingUser ? "Edit User" : "New User"}
        action={
          <button
            onClick={onClose}
            className="text-text-muted dark:text-text-muted-dark hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        }
        className="max-w-lg w-full animate-fade-in"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Input
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!editingUser}
            placeholder="username"
          />

          <div>
            <label className="field-label">Authentication Methods</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authMethods.includes("local")}
                  onChange={() => toggleAuthMethod("local")}
                  className="rounded border-border dark:border-border-dark text-primary focus:ring-primary bg-white dark:bg-card-dark"
                />
                <span className="text-sm text-text-muted dark:text-text-muted-dark">
                  Local (Password)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authMethods.includes("oidc")}
                  onChange={() => toggleAuthMethod("oidc")}
                  className="rounded border-border dark:border-border-dark text-primary focus:ring-primary bg-white dark:bg-card-dark"
                />
                <span className="text-sm text-text-muted dark:text-text-muted-dark">
                  OIDC (SSO)
                </span>
              </label>
            </div>
          </div>

          {authMethods.includes("local") && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <Input
                label={
                  editingUser
                    ? "New Password (leave blank to keep current)"
                    : "Password"
                }
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingUser ? "••••••••" : "password"}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save User"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
