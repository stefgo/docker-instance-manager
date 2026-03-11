import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatDate } from "../../../utils";

interface TokenModalProps {
  token: string;
  expiresAt: string;
  onClose: () => void;
}

export const TokenModal = ({ token, expiresAt, onClose }: TokenModalProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="glass-card max-w-lg w-full p-6 animate-fade-in">
        <h3 className="text-xl font-bold dark:text-app-text-main text-gray-900 mb-4">
          New Registration Token
        </h3>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            readOnly
            value={token}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 bg-gray-50 dark:bg-app-bg p-3 rounded-lg border border-gray-200 dark:border-app-border font-mono text-sm text-app-accent outline-none"
          />
          <button
            onClick={handleCopy}
            className={`px-3 py-3 border rounded-lg text-sm transition-colors ${
              copied
                ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400"
                : "bg-gray-100 dark:bg-app-input hover:bg-gray-200 dark:hover:bg-app-input/80 border-gray-200 dark:border-app-border text-gray-600 dark:text-app-text-muted"
            }`}
            title={copied ? "Copied!" : "Copy to clipboard"}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <div className="text-xs text-app-text-muted mb-6">
          Expires: {formatDate(expiresAt)}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 bg-app-input hover:bg-app-input/80 text-app-text-main rounded-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
};
