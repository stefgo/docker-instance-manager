import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card, Button } from "@stefgo/react-ui-components";
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
      <Card title="New Registration Token" className="max-w-lg w-full animate-fade-in">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={token}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 bg-app-bg dark:bg-card-dark p-3 rounded-lg border border-border dark:border-border-dark font-mono text-sm text-primary outline-none"
            />
            <button
              onClick={handleCopy}
              className={`px-3 py-3 border rounded-lg text-sm transition-colors ${
                copied
                  ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400"
                  : "bg-hover dark:bg-card-dark hover:bg-hover border-border dark:border-border-dark text-text-muted dark:text-text-muted-dark"
              }`}
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div className="text-xs text-text-muted dark:text-text-muted-dark">
            Expires: {formatDate(expiresAt)}
          </div>

          <Button variant="primary" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
};
