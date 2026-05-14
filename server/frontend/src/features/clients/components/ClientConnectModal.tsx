import { useState } from "react";
import { Save, X } from "lucide-react";
import { Card, Button, Input } from "@stefgo/react-ui-components";

interface ClientConnectModalProps {
  onSave: (data: {
    hostname: string;
    outboundTargetAddress: string;
    registrationSecret: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export const ClientConnectModal = ({
  onSave,
  onCancel,
}: ClientConnectModalProps) => {
  const [hostname, setHostname] = useState("");
  const [outboundTargetAddress, setOutboundTargetAddress] = useState("");
  const [registrationSecret, setRegistrationSecret] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!outboundTargetAddress.trim() || !registrationSecret.trim()) {
      setError("Target address and registration secret are required.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        hostname: hostname.trim() || outboundTargetAddress.trim(),
        outboundTargetAddress: outboundTargetAddress.trim(),
        registrationSecret: registrationSecret.trim(),
      });
      onCancel();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create client.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="max-w-lg w-full animate-fade-in">
        <Card
          className="flex flex-col"
          title="Add Outbound Client"
          action={
            <button
              onClick={onCancel}
              className="text-text-muted dark:text-text-muted-dark hover:text-text-primary transition-colors p-1 rounded-full hover:bg-hover dark:hover:bg-hover-dark"
            >
              <X size={20} />
            </button>
          }
          classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
        >
          <div className="p-7 bg-card dark:bg-card-dark">
            <p className="text-sm text-text-muted dark:text-text-muted-dark mb-6">
              The server connects to the client. Set{" "}
              <code className="bg-hover dark:bg-hover-dark px-1 rounded">REGISTRATION_SECRET</code>{" "}
              as environment variable on the client before saving.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Hostname (optional)"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="my-docker-host"
                disabled={isSaving}
                hint="Display name — defaults to target address if left empty"
              />

              <Input
                label="Target Address"
                value={outboundTargetAddress}
                onChange={(e) => setOutboundTargetAddress(e.target.value)}
                placeholder="192.168.1.100:3001"
                disabled={isSaving}
                hint="Host and port of the client's web server"
                required
              />

              <Input
                label="Registration Secret"
                value={registrationSecret}
                onChange={(e) => setRegistrationSecret(e.target.value)}
                placeholder="secret set via REGISTRATION_SECRET env var"
                disabled={isSaving}
                hint="Must match the REGISTRATION_SECRET configured on the client"
                required
              />

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onCancel}
                  disabled={isSaving}
                  icon={<X size={16} />}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSaving}
                  icon={<Save size={16} />}
                  className="shadow-glow-accent"
                >
                  {isSaving ? "Connecting..." : "Add Client"}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};
