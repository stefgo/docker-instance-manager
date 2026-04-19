import { useState, useEffect } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { Database, RefreshCw, Settings as SettingsIcon, Sliders, SearchCheck, Repeat, Tag } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { useSchedulerStore } from "../stores/useSchedulerStore";
import { DataCard } from "@stefgo/react-ui-components";
import { Input } from "@stefgo/react-ui-components";
import { Button } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../utils";

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 3 AM", value: "0 3 * * *" },
  { label: "Weekly (Sun 3 AM)", value: "0 3 * * 0" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

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
    image_update_check_interval_seconds: "0",
    container_auto_update_cron: "",
    container_auto_update_label: "dim.auto-update=true",
    container_auto_update_refresh_check: "true",
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
  const schedulerStatus = useSchedulerStore((s) => s.imageUpdateCheck);
  const autoUpdateStatus = useSchedulerStore((s) => s.containerAutoUpdate);
  const setImageUpdateCheckStatus = useSchedulerStore((s) => s.setImageUpdateCheckStatus);
  const setContainerAutoUpdateStatus = useSchedulerStore((s) => s.setContainerAutoUpdateStatus);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const [cronValidation, setCronValidation] = useState<"idle" | "valid" | "invalid">("idle");
  const [isRunningAutoUpdate, setIsRunningAutoUpdate] = useState(false);
  const [autoUpdateResult, setAutoUpdateResult] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchSettings();
      fetchSchedulerStatus();
    }
  }, [token]);

  useEffect(() => {
    if (autoUpdateResult) {
      const timer = setTimeout(() => setAutoUpdateResult(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [autoUpdateResult]);

  useEffect(() => {
    if (cronValidation !== "idle") {
      const timer = setTimeout(() => setCronValidation("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [cronValidation]);

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

  useEffect(() => {
    if (checkResult) {
      const timer = setTimeout(() => setCheckResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [checkResult]);

  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch("/api/v1/settings/scheduler-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.imageUpdateCheck) {
          setImageUpdateCheckStatus(data.imageUpdateCheck);
        }
        if (data.containerAutoUpdate) {
          setContainerAutoUpdateStatus(data.containerAutoUpdate);
        }
      }
    } catch (e) {
      console.error("Failed to fetch scheduler status:", e);
    }
  };

  const handleValidateCron = async () => {
    try {
      const response = await fetch(
        "/api/v1/settings/container-auto-update/validate-cron",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ expr: settings.container_auto_update_cron }),
        },
      );
      const data = (await response.json()) as { valid: boolean };
      setCronValidation(data.valid ? "valid" : "invalid");
    } catch {
      setCronValidation("invalid");
    }
  };

  const handleRunAutoUpdate = async () => {
    setIsRunningAutoUpdate(true);
    try {
      const response = await fetch(
        "/api/v1/settings/container-auto-update/run",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          eligible?: number;
          updated?: number;
          skippedNoUpdate?: number;
          skippedOffline?: number;
          failed?: number;
        };
        setAutoUpdateResult(
          `${data.updated ?? 0} updated / ${data.skippedNoUpdate ?? 0} no update / ${data.failed ?? 0} failed`,
        );
      } else {
        throw new Error("Failed to trigger auto-update");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsRunningAutoUpdate(false);
    }
  };

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
      await fetchSchedulerStatus();
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

  const handleImageUpdateCheck = async () => {
    setIsRunningCheck(true);
    try {
      const response = await fetch("/api/v1/settings/image-update-check/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { checked?: number };
        setCheckResult(
          typeof data.checked === "number" ? `${data.checked} checked` : "Done",
        );
      } else {
        throw new Error("Failed to trigger check");
      }
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setIsRunningCheck(false);
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
            <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
              <SearchCheck size={18} /> Image Update Check
            </Tab>
            <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
              <Repeat size={18} /> Container Auto-Update
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
              <TabPanel className="animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="max-w-3xl space-y-8">
                  <section>
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-text-primary dark:text-text-primary-dark flex items-center gap-2">
                        Scheduled Image Update Check
                      </h3>
                      <p className="text-sm text-text-muted dark:text-text-muted-dark">
                        Periodically checks all images from all clients against
                        their registry for available updates.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          Check Interval (Seconds)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={settings.image_update_check_interval_seconds}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              image_update_check_interval_seconds: Math.max(
                                0,
                                parseInt(e.target.value) || 0,
                              ).toString(),
                            })
                          }
                          placeholder="0"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          How often all images are checked. Set to 0 to
                          disable the scheduler (e.g. 3600 = every hour).
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                            Status
                          </p>
                          {schedulerStatus.isRunning ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                              <RefreshCw size={12} className="animate-spin" />
                              Running…
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted dark:text-text-muted-dark">Idle</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                            Last Run
                          </p>
                          <p className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                            {formatDateTime(schedulerStatus.lastRun)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                            Next Run
                          </p>
                          <p className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                            {schedulerStatus.nextRun
                              ? formatDateTime(schedulerStatus.nextRun)
                              : "Disabled"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 p-4 bg-hover dark:bg-card-dark rounded-xl border border-border dark:border-border-dark flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
                          Manual Run
                        </h4>
                        <p className="text-xs text-text-muted dark:text-text-muted-dark">
                          Immediately check all images against their registry.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={handleImageUpdateCheck}
                        disabled={isRunningCheck || !!checkResult}
                        className="w-[160px]"
                      >
                        {isRunningCheck ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : checkResult ? (
                          <span className="animate-in zoom-in duration-300">
                            {checkResult}
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
                        Container Auto-Update
                      </h3>
                      <p className="text-sm text-text-muted dark:text-text-muted-dark">
                        Automatically pull updated images and recreate containers on a
                        schedule. Containers are selected either by Docker label or
                        manually via the Auto-Update toggle in the Container management view.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          Cron Expression
                        </label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={settings.container_auto_update_cron}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                container_auto_update_cron: e.target.value,
                              })
                            }
                            placeholder="0 3 * * *"
                            className="font-mono flex-1"
                          />
                          <Button
                            variant="secondary"
                            onClick={handleValidateCron}
                            disabled={!settings.container_auto_update_cron}
                            className="w-[120px]"
                          >
                            {cronValidation === "valid" ? (
                              <span className="text-green-600 dark:text-green-400">Valid</span>
                            ) : cronValidation === "invalid" ? (
                              <span className="text-red-600 dark:text-red-400">Invalid</span>
                            ) : (
                              <span>Validate</span>
                            )}
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CRON_PRESETS.map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() =>
                                setSettings({
                                  ...settings,
                                  container_auto_update_cron: p.value,
                                })
                              }
                              className="text-xs px-2 py-1 rounded border border-border dark:border-border-dark hover:bg-hover dark:hover:bg-card-dark"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-app-text-footer leading-relaxed mt-1">
                          Leave empty to disable the scheduler. Standard 5-field cron
                          syntax (min hour dom mon dow).
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                          <span className="inline-flex items-center gap-1">
                            <Tag size={12} /> Auto-Update Label
                          </span>
                        </label>
                        <Input
                          type="text"
                          value={settings.container_auto_update_label}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              container_auto_update_label: e.target.value,
                            })
                          }
                          placeholder="dim.auto-update=true"
                          className="font-mono"
                        />
                        <p className="text-xs text-app-text-footer leading-relaxed">
                          Containers carrying this label are included automatically.
                          Format: <code>key=value</code> or just <code>key</code> (matches any value).
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border dark:border-border-dark text-primary focus:ring-primary"
                            checked={settings.container_auto_update_refresh_check === "true"}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                container_auto_update_refresh_check: e.target.checked
                                  ? "true"
                                  : "false",
                              })
                            }
                          />
                          <span className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
                            Re-check image updates before updating
                          </span>
                        </label>
                        <p className="text-xs text-app-text-footer leading-relaxed mt-1 ml-7">
                          When enabled, each image is checked against its registry right
                          before the update. When disabled, the cached check result is
                          used (faster, but depends on a recent image-update-check run).
                        </p>
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                              Status
                            </p>
                            {autoUpdateStatus.isRunning ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                                <RefreshCw size={12} className="animate-spin" />
                                Running…
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted dark:text-text-muted-dark">
                                {autoUpdateStatus.cronExpression ? "Scheduled" : "Disabled"}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                              Last Run
                            </p>
                            <p className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                              {formatDateTime(autoUpdateStatus.lastRun)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1">
                              Active Cron
                            </p>
                            <p className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
                              {autoUpdateStatus.cronExpression || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 p-4 bg-hover dark:bg-card-dark rounded-xl border border-border dark:border-border-dark flex items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
                          Manual Run
                        </h4>
                        <p className="text-xs text-text-muted dark:text-text-muted-dark">
                          Trigger the auto-update sweep immediately for all eligible containers.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={handleRunAutoUpdate}
                        disabled={isRunningAutoUpdate || !!autoUpdateResult}
                        className="w-[260px]"
                      >
                        {isRunningAutoUpdate ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : autoUpdateResult ? (
                          <span className="animate-in zoom-in duration-300">
                            {autoUpdateResult}
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
