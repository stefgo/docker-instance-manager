import { useState, useEffect } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { Database, RefreshCw, Settings as SettingsIcon, Sliders } from "lucide-react";
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
    image_version_cache_ttl_days: "30",
    image_version_cache_cleanup_orphans: "true",
    image_version_cache_cleanup_interval_hours: "24",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningTokens, setIsCleaningTokens] = useState(false);
  const [tokensCleanupResult, setTokensCleanupResult] = useState<string | null>(
    null,
  );
  const [isCleaningImageCache, setIsCleaningImageCache] = useState(false);
  const [imageCacheCleanupResult, setImageCacheCleanupResult] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchSettings();
    }
  }, [token]);

  useEffect(() => {
    if (tokensCleanupResult) {
      const timer = setTimeout(() => setTokensCleanupResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [tokensCleanupResult]);

  useEffect(() => {
    if (imageCacheCleanupResult) {
      const timer = setTimeout(() => setImageCacheCleanupResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [imageCacheCleanupResult]);

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

  const handleTokensCleanup = async () => {
    setIsCleaningTokens(true);
    try {
      const response = await fetch("/api/v1/settings/cleanup/invalid-tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = (await response.json()) as { removed?: number };
        setTokensCleanupResult(
          typeof data.removed === "number"
            ? `Removed ${data.removed}`
            : "Done",
        );
      } else {
        throw new Error("Failed to trigger cleanup");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsCleaningTokens(false);
    }
  };

  const handleImageCacheCleanup = async () => {
    setIsCleaningImageCache(true);
    try {
      const response = await fetch(
        "/api/v1/settings/cleanup/image-version-cache",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          orphansRemoved?: number;
          expiredRemoved?: number;
        };
        const orphans = data.orphansRemoved ?? 0;
        const expired = data.expiredRemoved ?? 0;
        setImageCacheCleanupResult(`${orphans} orphan / ${expired} expired`);
      } else {
        throw new Error("Failed to trigger cleanup");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsCleaningImageCache(false);
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
              <Sliders size={18} /> Clients Tokens
            </Tab>
            <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
              <Database size={18} /> Image Version Cache
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
                        onClick={handleTokensCleanup}
                        disabled={isCleaningTokens || !!tokensCleanupResult}
                        className="w-[160px]"
                      >
                        {isCleaningTokens ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : tokensCleanupResult ? (
                          <span className="animate-in zoom-in duration-300">
                            {tokensCleanupResult}
                          </span>
                        ) : (
                          <span>Run Now</span>
                        )}
                      </Button>
                    </div>
                  </section>
                </div>
              </TabPanel>
              <TabPanel className="animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="max-w-3xl space-y-8">
                  <section>
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-text-primary dark:text-text-primary-dark flex items-center gap-2">
                        Image Version Cache
                      </h3>
                      <p className="text-sm text-text-muted dark:text-text-muted-dark">
                        Controls the cleanup of cached image update-check
                        results. Entries become obsolete when an image tag is
                        no longer referenced by any client, or when a check
                        result is older than the retention window.
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
                          value={settings.image_version_cache_ttl_days}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              image_version_cache_ttl_days: Math.max(
                                0,
                                parseInt(e.target.value) || 0,
                              ).toString(),
                            })
                          }
                          placeholder="30"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          Number of days a cached check result is kept. Set
                          to 0 to disable expiry-based cleanup.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          Cleanup Interval (Hours)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={
                            settings.image_version_cache_cleanup_interval_hours
                          }
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              image_version_cache_cleanup_interval_hours: Math.max(
                                0,
                                parseInt(e.target.value) || 0,
                              ).toString(),
                            })
                          }
                          placeholder="24"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          How often the automatic sweep runs. Set to 0 to
                          disable the scheduler (manual runs still work).
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border dark:border-border-dark text-primary focus:ring-primary"
                            checked={
                              settings.image_version_cache_cleanup_orphans ===
                              "true"
                            }
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                image_version_cache_cleanup_orphans: e.target
                                  .checked
                                  ? "true"
                                  : "false",
                              })
                            }
                          />
                          <span className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
                            Remove orphaned entries
                          </span>
                        </label>
                        <p className="text-xs text-app-text-footer leading-relaxed mt-1 ml-7">
                          Delete cached check results for image tags that are
                          no longer referenced by any client.
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 p-4 bg-hover dark:bg-card-dark rounded-xl border border-border dark:border-border-dark flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
                          Manual Run
                        </h4>
                        <p className="text-xs text-text-muted dark:text-text-muted-dark">
                          Immediately sweep orphaned and expired entries
                          using the current settings.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={handleImageCacheCleanup}
                        disabled={
                          isCleaningImageCache || !!imageCacheCleanupResult
                        }
                        className="w-[200px]"
                      >
                        {isCleaningImageCache ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : imageCacheCleanupResult ? (
                          <span className="animate-in zoom-in duration-300">
                            {imageCacheCleanupResult}
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
