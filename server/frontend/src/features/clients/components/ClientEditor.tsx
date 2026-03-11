import { useState } from "react";
import { Client } from "@dim/shared";
import { Save, X } from "lucide-react";

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
    <div className="bg-app-card rounded-xl border border-gray-200 dark:border-app-border shadow-premium flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-app-border flex justify-between items-center bg-gray-50 dark:bg-app-input rounded-t-xl">
        <h3 className="text-xl font-bold text-gray-900 dark:text-app-text-main">
          Edit Client
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-500 dark:text-app-text-muted hover:text-gray-900 dark:hover:text-app-text-main transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={client.hostname}
              className="w-full px-3 py-2 bg-app-card dark:bg-app-input border border-gray-300 dark:border-app-border rounded-lg focus:outline-none focus:ring-2 focus:ring-app-accent dark:text-app-text-main outline-none transition-all"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-app-text-footer">
              Leave empty to use hostname ({client.hostname})
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-700 dark:text-app-text-main hover:bg-gray-100 dark:hover:bg-app-input rounded-lg transition-colors flex items-center gap-2"
              disabled={isSaving}
            >
              <X size={16} /> Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-app-accent hover:bg-app-accent-hover text-white rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 shadow-glow-accent"
              disabled={isSaving}
            >
              <Save size={16} /> {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
