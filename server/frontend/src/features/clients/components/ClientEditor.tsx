import { useState } from "react";
import { Client } from "@dim/shared";
import { Save, X } from "lucide-react";
import { Card, Button, Input } from "@stefgo/react-ui-components";

interface ClientEditorProps {
  client: Client;
  onSave: (id: string, data: { displayName?: string }) => Promise<void>;
  onCancel: () => void;
}

export const ClientEditor = ({
  client,
  onSave,
  onCancel,
}: ClientEditorProps) => {
  const [displayName, setDisplayName] = useState(client.displayName || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(client.id, { displayName: displayName.trim() });
      onCancel();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      className="flex flex-col"
      title="Edit Client"
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
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={client.hostname}
            disabled={isSaving}
            hint={`Leave empty to use hostname (${client.hostname})`}
          />

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
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
};
