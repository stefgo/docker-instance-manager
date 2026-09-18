import { useState, useEffect, useCallback } from "react";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { Database, RefreshCw, Settings as SettingsIcon, Sliders, SearchCheck, Repeat, Tag, Bell } from "lucide-react";
import { useSchedulerStore } from "../stores/useSchedulerStore";
import { useProjectStore } from "../stores/useProjectStore";
import { Card } from "@stefgo/react-ui-components";
import { Input } from "@stefgo/react-ui-components";
import { Button } from "@stefgo/react-ui-components";
import { Checkbox, cn, FOCUS_RING, FOCUS_RING_INSET, useConfirm } from "@stefgo/react-ui-components";
import { describeFailure, plural } from "../utils";
import { apiFetch } from "../lib/apiFetch";

const CRON_PRESETS: Array<{ label: string; value: string }> = [
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every 6 hours", value: "0 */6 * * *" },
    { label: "Daily at 3 AM", value: "0 3 * * *" },
    { label: "Weekly (Sun 3 AM)", value: "0 3 * * 0" },
];

type SchedulerStatus = ReturnType<typeof useSchedulerStore.getState>;

interface SchedulerStatusResponse {
    imageUpdateCheck?: SchedulerStatus["imageUpdateCheck"];
    notificationCleanupLastRun?: string | null;
}

/** Loads the scheduler status without touching state; null when it cannot be read. */
async function requestSchedulerStatus(): Promise<SchedulerStatusResponse | null> {
    try {
        const response = await apiFetch("/api/v1/settings/scheduler-status");
        return response.ok ? await response.json() : null;
    } catch (e) {
        console.error("Failed to fetch scheduler status:", e);
        return null;
    }
}

function formatDateTime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}

export default function Settings() {
    const { alert } = useConfirm();
    // The default schedule is what a project inherits while it names none of its own, so
    // the field says how many projects that currently is.
    const projects = useProjectStore((s) => s.projects);
    const inheritingProjects = projects.filter((p) => p.autoUpdate && p.cron === null).length;

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
        container_auto_update_delay_label: "dim.auto-update-delay",
        notification_retention_days: "90",
        notification_retention_count: "500",
        notification_cleanup_interval_hours: "24",
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
    const setImageUpdateCheckStatus = useSchedulerStore((s) => s.setImageUpdateCheckStatus);
    const [isRunningCheck, setIsRunningCheck] = useState(false);
    const [checkResult, setCheckResult] = useState<string | null>(null);

    const [cronValidation, setCronValidation] = useState<"idle" | "valid" | "invalid">("idle");
    const [isCleaningNotifications, setIsCleaningNotifications] = useState(false);
    const [notificationCleanupResult, setNotificationCleanupResult] = useState<string | null>(null);
    const [notificationCleanupLastRun, setNotificationCleanupLastRun] = useState<string | null>(null);

    // Split into a request that touches no state and a function that applies its answer:
    // the effect below may only set state once the response is there, and handleSave
    // loads the status again after saving. The store setters are stable; the state
    // setter is stable by definition.
    const applySchedulerStatus = useCallback((data: SchedulerStatusResponse) => {
        if (data.imageUpdateCheck) {
            setImageUpdateCheckStatus(data.imageUpdateCheck);
        }
        if (typeof data.notificationCleanupLastRun === "string" || data.notificationCleanupLastRun === null) {
            setNotificationCleanupLastRun(data.notificationCleanupLastRun);
        }
    }, [setImageUpdateCheckStatus]);

    const fetchSchedulerStatus = async () => {
        const data = await requestSchedulerStatus();
        if (data) applySchedulerStatus(data);
    };

    // Settings and scheduler status are loaded once, inside the effect. isLoading starts
    // out true, so the load only ever has to lower it -- raising it here, synchronously,
    // rendered the page twice for nothing.
    useEffect(() => {
        let cancelled = false;
        const loadSettings = async () => {
            try {
                const response = await apiFetch("/api/v1/settings/cleanup");
                if (response.ok) {
                    const data = await response.json();
                    if (!cancelled) setSettings(data);
                }
            } catch (e) {
                console.error("Failed to fetch settings:", e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        loadSettings();
        requestSchedulerStatus().then((data) => {
            if (!cancelled && data) applySchedulerStatus(data);
        });
        return () => {
            cancelled = true;
        };
    }, [applySchedulerStatus]);

    useEffect(() => {
        if (notificationCleanupResult) {
            const timer = setTimeout(() => setNotificationCleanupResult(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notificationCleanupResult]);

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

    const handleValidateCron = async () => {
        try {
            const response = await apiFetch(
                "/api/v1/settings/container-auto-update/validate-cron",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ expr: settings.container_auto_update_cron }),
                },
            );
            const data = (await response.json()) as { valid: boolean };
            setCronValidation(data.valid ? "valid" : "invalid");
        } catch {
            setCronValidation("invalid");
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await apiFetch("/api/v1/settings/cleanup", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            if (!response.ok) {
                // The endpoint validates the body and names the offending field.
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || "Failed to save settings");
            }
            await fetchSchedulerStatus();
        } catch (e: unknown) {
            alert(describeFailure("Could not save the settings", e));
        } finally {
            setIsSaving(false);
        }
    };

    const handleTokensCleanup = async () => {
        setIsCleaningTokens(true);
        try {
            const response = await apiFetch("/api/v1/settings/cleanup/invalid-tokens", {
                method: "POST",
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
            alert(describeFailure("Could not remove the invalid tokens", e));
        } finally {
            setIsCleaningTokens(false);
        }
    };

    const handleImageUpdateCheck = async () => {
        setIsRunningCheck(true);
        try {
            const response = await apiFetch("/api/v1/settings/image-update-check/run", {
                method: "POST",
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
            alert(describeFailure("Could not run the image update check", e));
        } finally {
            setIsRunningCheck(false);
        }
    };

    const handleNotificationCleanup = async () => {
        setIsCleaningNotifications(true);
        try {
            const response = await apiFetch("/api/v1/settings/cleanup/notifications", {
                method: "POST",
            });
            if (response.ok) {
                const data = (await response.json()) as { removed?: number };
                setNotificationCleanupResult(
                    typeof data.removed === "number" ? `Removed ${data.removed}` : "Done",
                );
                setNotificationCleanupLastRun(new Date().toISOString());
            } else {
                throw new Error("Failed to trigger cleanup");
            }
        } catch (e: unknown) {
            alert(describeFailure("Could not clean up the notifications", e));
        } finally {
            setIsCleaningNotifications(false);
        }
    };

    const handleImageCacheCleanup = async () => {
        setIsCleaningImageCache(true);
        try {
            const response = await apiFetch(
                "/api/v1/settings/cleanup/image-version-cache",
                {
                    method: "POST",
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
            alert(describeFailure("Could not clean up the image cache", e));
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

    // The tab fills the sidebar's width, so the ring is drawn inside it -- an outward one
    // would be clipped by the panel border next to it.
    const tabBaseClass = cn(
        "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition duration-200 cursor-pointer border-l-4 border-transparent",
        FOCUS_RING_INSET,
    );
    const tabSelectedClass =
        "bg-primary/10 text-primary border-l-primary shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card
                title={
                    <span className="flex items-center gap-2 font-semibold">
                        <SettingsIcon size={18} className="text-text-muted" /> System
                        Settings
                    </span>
                }
                className="overflow-visible"
                padding="none"
            >
                <Tabs className="flex flex-col md:flex-row min-h-[450px]">
                    {/* Sidebar Tabs */}
                    <TabList className="w-full md:w-64 bg-app-bg border-r border-border py-4 flex flex-col gap-1">
                        <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
                            <Sliders size={18} /> Client Tokens
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
                        <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>
                            <Bell size={18} /> Notification History
                        </Tab>
                    </TabList>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col">
                        <div className="flex-1 p-8">
                            <TabPanel className="animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="max-w-3xl space-y-8">
                                    <section>
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                                Retention of invalid client tokens
                                            </h3>
                                            <p className="text-sm text-text-muted">
                                                Define how long registration tokens are kept after they
                                                become invalid.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Number of days an invalid token remains in the
                                                    database.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Ensure at least this many invalid tokens are always
                                                    kept.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-4 bg-hover rounded-xl border border-border flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-primary">
                                                    Manual Run
                                                </h4>
                                                <p className="text-xs text-text-muted">
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
                                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                                Image Version Cache
                                            </h3>
                                            <p className="text-sm text-text-muted">
                                                Controls the cleanup of cached image update-check
                                                results. Entries become obsolete when an image tag is
                                                no longer referenced by any client, or when a check
                                                result is older than the retention window.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Number of days a cached check result is kept. Set
                                                    to 0 to disable expiry-based cleanup.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    How often the automatic sweep runs. Set to 0 to
                                                    disable the scheduler (manual runs still work).
                                                </p>
                                            </div>
                                            <div className="md:col-span-2">
                                                <Checkbox
                                                    label="Remove orphaned entries"
                                                    classNames={{ label: "text-sm font-medium text-text-primary" }}
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
                                                <p className="text-xs text-text-muted leading-relaxed mt-1 ml-7">
                                                    Delete cached check results for image tags that are
                                                    no longer referenced by any client.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-4 bg-hover rounded-xl border border-border flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-primary">
                                                    Manual Run
                                                </h4>
                                                <p className="text-xs text-text-muted">
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
                                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                                Scheduled Image Update Check
                                            </h3>
                                            <p className="text-sm text-text-muted">
                                                Periodically checks all images from all clients against
                                                their registry for available updates.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    How often all images are checked. Set to 0 to
                                                    disable the scheduler (e.g. 3600 = every hour).
                                                </p>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs font-bold text-text-muted uppercase mb-1">
                                                        Status
                                                    </p>
                                                    {schedulerStatus.isRunning ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                                                            <RefreshCw size={12} className="animate-spin" />
                                                            Running…
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-text-muted">Idle</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-text-muted uppercase mb-1">
                                                        Last Run
                                                    </p>
                                                    <p className="text-sm text-text-primary font-mono">
                                                        {formatDateTime(schedulerStatus.lastRun)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-text-muted uppercase mb-1">
                                                        Next Run
                                                    </p>
                                                    <p className="text-sm text-text-primary font-mono">
                                                        {schedulerStatus.nextRun
                                                            ? formatDateTime(schedulerStatus.nextRun)
                                                            : "Disabled"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-4 bg-hover rounded-xl border border-border flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-primary">
                                                    Manual Run
                                                </h4>
                                                <p className="text-xs text-text-muted">
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
                                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                                Container Auto-Update
                                            </h3>
                                            <p className="text-sm text-text-muted">
                                                Every agent pulls updated images and recreates containers on its
                                                own clock. A container takes part through the Docker label below or
                                                through a project with auto-update switched on; this page sets the
                                                default schedule the hosts and projects inherit.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                            <span className="text-success">Valid</span>
                                                        ) : cronValidation === "invalid" ? (
                                                            <span className="text-error">Invalid</span>
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
                                                            className={cn(
                                                                "text-xs px-2 py-1 rounded border border-border hover:bg-hover",
                                                                FOCUS_RING,
                                                            )}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-text-muted leading-relaxed mt-1">
                                                    The default every host and project inherits while it names no
                                                    schedule of its own. Leave empty and only hosts and projects with
                                                    an expression of their own take part. Standard 5-field cron syntax
                                                    (min hour dom mon dow).
                                                    {" "}
                                                    {inheritingProjects === 0
                                                        ? "No project uses it as its schedule right now."
                                                        : `${plural(inheritingProjects, "project")} with auto-update ${inheritingProjects === 1 ? "uses it as its" : "use it as their"} schedule.`}
                                                </p>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
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
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Containers carrying this label are included automatically; the other
                                                    way in is a project with auto-update switched on.
                                                    Format: <code>key=value</code> or just <code>key</code> (matches any value).
                                                    The same key carrying <code>false</code> opts a container out of both.
                                                </p>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Tag size={12} /> Update Delay Label
                                                    </span>
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={settings.container_auto_update_delay_label}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            container_auto_update_delay_label: e.target.value,
                                                        })
                                                    }
                                                    placeholder="dim.auto-update-delay"
                                                    className="font-mono"
                                                />
                                                <p className="text-xs text-text-muted leading-relaxed mt-1">
                                                    Docker label that controls the update delay per container. The label value specifies
                                                    the minimum age in days a new image must have before it is applied.
                                                    Example: <code>dim.auto-update-delay=3</code> delays updates by 3 days.
                                                    Leave empty to disable delay support.
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </TabPanel>
                            <TabPanel className="animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="max-w-3xl space-y-8">
                                    <section>
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                                Notification History
                                            </h3>
                                            <p className="text-sm text-text-muted">
                                                Controls how long notifications are kept in the database.
                                                Old entries are removed automatically while always preserving
                                                a minimum number of the most recent notifications.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                                                    Retention Time (Days)
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={settings.notification_retention_days}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            notification_retention_days: Math.max(
                                                                1,
                                                                parseInt(e.target.value) || 1,
                                                            ).toString(),
                                                        })
                                                    }
                                                    placeholder="90"
                                                />
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Notifications older than this are eligible for removal.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                                                    Minimum Keep Count
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={settings.notification_retention_count}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            notification_retention_count: Math.max(
                                                                0,
                                                                parseInt(e.target.value) || 0,
                                                            ).toString(),
                                                        })
                                                    }
                                                    placeholder="500"
                                                />
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    Always keep at least this many of the most recent notifications,
                                                    regardless of age.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                                                    Cleanup Interval (Hours)
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={settings.notification_cleanup_interval_hours}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            notification_cleanup_interval_hours: Math.max(
                                                                0,
                                                                parseInt(e.target.value) || 0,
                                                            ).toString(),
                                                        })
                                                    }
                                                    placeholder="24"
                                                />
                                                <p className="text-xs text-text-muted leading-relaxed">
                                                    How often the automatic cleanup runs. Set to 0 to disable
                                                    the scheduler (manual runs still work).
                                                </p>
                                            </div>
                                            <div className="md:col-span-2">
                                                <p className="text-xs font-bold text-text-muted uppercase mb-1">
                                                    Last Run
                                                </p>
                                                <p className="text-sm text-text-primary font-mono">
                                                    {formatDateTime(notificationCleanupLastRun)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-4 bg-hover rounded-xl border border-border flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-primary">
                                                    Manual Run
                                                </h4>
                                                <p className="text-xs text-text-muted">
                                                    Immediately remove notifications that exceed the retention settings.
                                                </p>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                onClick={handleNotificationCleanup}
                                                disabled={isCleaningNotifications || !!notificationCleanupResult}
                                                className="w-[160px]"
                                            >
                                                {isCleaningNotifications ? (
                                                    <RefreshCw size={16} className="animate-spin" />
                                                ) : notificationCleanupResult ? (
                                                    <span className="animate-in zoom-in duration-300">
                                                        {notificationCleanupResult}
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
                <div className="p-4 border-t border-border flex justify-end gap-3 bg-hover rounded-b-xl">
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={isSaving}
                        isLoading={isSaving}
                        className="px-6 py-2 shadow-glow-accent"
                    >
                        Save
                    </Button>
                </div>
            </Card>
        </div>
    );
}
