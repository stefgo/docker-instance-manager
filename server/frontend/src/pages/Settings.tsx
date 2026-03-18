import { useState, useEffect } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { RefreshCw, Settings as SettingsIcon, Sliders } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { DataCard } from "@stefgo/react-ui-components";
import { Input } from "@stefgo/react-ui-components";
import { Button } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../utils";

export default function Settings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({
    retention_invalid_tokens_days: "30",
    retention_invalid_tokens_count: "10",
    retention_job_history_days: "90",
    retention_job_history_count: "50",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchSettings();
    }
  }, [token]);

  useEffect(() => {
    if (cleanupResult) {
      const timer = setTimeout(() => setCleanupResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [cleanupResult]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/settings/cleanup", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (e) {
      console.error("Failed to fetch settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/v1/settings/cleanup", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const response = await fetch("/api/v1/settings/cleanup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setCleanupResult("Done");
      } else {
        throw new Error("Failed to trigger cleanup");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const tabBaseClass =
    "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 cursor-pointer outline-none border-l-4 border-transparent";
  const tabSelectedClass =
    "bg-primary/10 text-primary border-l-primary shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DataCard
        title={
          <span className="flex items-center gap-2 font-semibold">
            <SettingsIcon size={18} className="text-text-muted dark:text-text-muted-dark" /> System
            Settings
          </span>
        }
        className="p-0 overflow-hidden overflow-visible"
        noPadding={true}
      >
        <Tabs className="flex flex-col md:flex-row min-h-[450px]">
          {/* Sidebar Tabs */}
          <TabList className="w-full md:w-64 bg-app-bg dark:bg-app-bg-dark border-r border-border dark:border-border-dark py-4 flex flex-col gap-1">
            <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
              <Sliders size={18} /> Common
            </Tab>
          </TabList>

          {/* Content Area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-8">
              <TabPanel className="animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="max-w-3xl space-y-8">
                  <section>
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-text-primary dark:text-text-primary-dark flex items-center gap-2">
                        Retention of invalid client tokens
                      </h3>
                      <p className="text-sm text-text-muted dark:text-text-muted-dark">
                        Define how long registration tokens are kept after they
                        become invalid.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          Retention Time (Days)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={settings.retention_invalid_tokens_days}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              retention_invalid_tokens_days: Math.max(
                                0,
                                parseInt(e.target.value) || 0,
                              ).toString(),
                            })
                          }
                          placeholder="30"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          Number of days an invalid token remains in the
                          database.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          Minimum Keep Count
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={settings.retention_invalid_tokens_count}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              retention_invalid_tokens_count: Math.max(
                                0,
                                parseInt(e.target.value) || 0,
                              ).toString(),
                            })
                          }
                          placeholder="10"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          Ensure at least this many invalid tokens are always
                          kept.
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 p-4 bg-hover dark:bg-card-dark rounded-xl border border-border dark:border-border-dark flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
                          Manual Run
                        </h4>
                        <p className="text-xs text-text-muted dark:text-text-muted-dark">
                          Trigger the maintenance process immediately using the
                          current retention settings.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={handleCleanup}
                        disabled={isCleaning || !!cleanupResult}
                        className="w-[140px]"
                      >
                        {isCleaning ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : cleanupResult ? (
                          <span className="animate-in zoom-in duration-300">
                            {cleanupResult}
                          </span>
                        ) : (
                          <span>Run Now</span>
                        )}
                      </Button>
                    </div>
                  </section>
                </div>
              </TabPanel>
            </div>
          </div>
        </Tabs>
        {/* Sticky Action Footer */}
        <div className="p-4 border-t border-border dark:border-border-dark flex justify-end gap-3 bg-hover dark:bg-card-dark rounded-b-xl">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 shadow-glow-accent"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DataCard>
    </div>
  );
}
