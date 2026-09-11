import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { ActionButton, Button, Card, cn, FOCUS_RING } from "@stefgo/react-ui-components";
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
                            className={cn(
                                "flex-1 bg-app-bg p-3 rounded-lg border border-border font-mono text-sm text-primary",
                                FOCUS_RING,
                            )}
                        />
                        {/* `color` sets the hover colour as well, so without it the green
                            confirmation would only last while the pointer stays put. */}
                        <ActionButton
                            icon={copied ? Check : Copy}
                            size="lg"
                            variant="solid"
                            color={copied ? "green" : "gray"}
                            tooltip={copied ? "Copied!" : "Copy to clipboard"}
                            onClick={handleCopy}
                            className={copied ? "text-success" : undefined}
                        />
                    </div>

                    <div className="text-xs text-text-muted">
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
