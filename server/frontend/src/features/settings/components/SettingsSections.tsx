import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { Button, Checkbox, cn, FOCUS_RING, Input } from "@stefgo/react-ui-components";
import { apiFetch } from "../../../lib/apiFetch";
import { plural } from "../../../utils";
import { useSchedulerStore } from "../../../stores/useSchedulerStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import type { RegistryStatus } from "@dim/shared";
import type { SectionProps } from "../sections";
import { FieldCaption, ManualRunBox, NumberField, SectionHeader } from "./SettingsParts";
import { SchedulerStatusBox } from "./SchedulerStatusBox";
import { RegistryStatusTable } from "./RegistryStatusTable";

/** A stable empty list, so the image check section does not get a new one on every render. */
const NO_REGISTRIES: RegistryStatus[] = [];

const CRON_PRESETS: Array<{ label: string; value: string }> = [
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every 6 hours", value: "0 */6 * * *" },
    { label: "Daily at 3 AM", value: "0 3 * * *" },
    { label: "Weekly (Sun 3 AM)", value: "0 3 * * 0" },
];

/** Starts a maintenance job and returns its answer; throws when the server refuses. */
async function runJob<T>(url: string): Promise<T> {
    const response = await apiFetch(url, { method: "POST" });
    if (!response.ok) throw new Error("The server refused to start the job");
    return (await response.json()) as T;
}

export const TokenRetentionSection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Retention of invalid client tokens">
            Define how long registration tokens are kept after they become invalid. A scheduled
            cleanup removes the ones older than that.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.token_retention_days}
                onChange={(v) => onChange("token_retention_days", v)}
                placeholder="30"
                hint="Number of days an invalid token remains in the database."
            />
            <NumberField
                label="Cleanup Interval (Hours)"
                value={values.token_cleanup_interval_hours}
                onChange={(v) => onChange("token_cleanup_interval_hours", v)}
                placeholder="24"
                hint="How often the automatic cleanup runs. Set to 0 to disable the scheduler (manual runs still work)."
            />
        </div>

        <SchedulerStatusBox scheduler="token-cleanup" />

        <ManualRunBox
            description="Trigger the maintenance process immediately using the saved retention settings."
            failureTitle="Could not remove the invalid tokens"
            onRun={async () => {
                const data = await runJob<{ removed?: number }>("/api/v1/settings/cleanup/invalid-tokens");
                return typeof data.removed === "number" ? `Removed ${data.removed}` : "Done";
            }}
        />
    </section>
);

export const ImageCacheSection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Image Version Cache">
            Controls the cleanup of cached image update-check results. Entries become obsolete when
            an image tag is no longer referenced by any client, or when a check result is older than
            the retention window.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.image_version_cache_ttl_days}
                onChange={(v) => onChange("image_version_cache_ttl_days", v)}
                placeholder="30"
                hint="Number of days a cached check result is kept. Set to 0 to disable expiry-based cleanup."
            />
            <NumberField
                label="Cleanup Interval (Hours)"
                value={values.image_version_cache_cleanup_interval_hours}
                onChange={(v) => onChange("image_version_cache_cleanup_interval_hours", v)}
                placeholder="24"
                hint="How often the automatic sweep runs. Set to 0 to disable the scheduler (manual runs still work)."
            />
            <div className="md:col-span-2">
                <Checkbox
                    label="Remove orphaned entries"
                    classNames={{ label: "text-sm font-medium text-text-primary" }}
                    checked={values.image_version_cache_cleanup_orphans === "true"}
                    onChange={(e) =>
                        onChange("image_version_cache_cleanup_orphans", e.target.checked ? "true" : "false")
                    }
                />
                <p className="text-xs text-text-muted leading-relaxed max-w-prose mt-1 ml-7">
                    Delete cached check results for image tags that are no longer referenced by any client.
                </p>
            </div>
        </div>

        <SchedulerStatusBox scheduler="image-cache-cleanup" />

        <ManualRunBox
            description="Immediately sweep orphaned and expired entries using the saved settings."
            failureTitle="Could not clean up the image cache"
            buttonClassName="w-[200px]"
            onRun={async () => {
                const data = await runJob<{ orphansRemoved?: number; expiredRemoved?: number }>(
                    "/api/v1/settings/cleanup/image-version-cache",
                );
                return `${data.orphansRemoved ?? 0} orphan / ${data.expiredRemoved ?? 0} expired`;
            }}
        />
    </section>
);

export const ImageUpdateCheckSection = ({ values, onChange }: SectionProps) => {
    const registries = useSchedulerStore((s) => s.schedulers["image-update-check"]?.registries) ?? NO_REGISTRIES;

    return (
        <section>
            <SectionHeader title="Scheduled Image Update Check">
                Periodically checks all images from all clients against their registry for available updates.
            </SectionHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <NumberField
                    label="Check Interval (Seconds)"
                    value={values.image_update_check_interval_seconds}
                    onChange={(v) => onChange("image_update_check_interval_seconds", v)}
                    placeholder="0"
                    hint="How often all images are checked. Set to 0 to disable the scheduler (e.g. 3600 = every hour)."
                />
            </div>

            <div className="mt-8">
                <FieldCaption>Registries</FieldCaption>
                <RegistryStatusTable registries={registries} />
            </div>

            <SchedulerStatusBox scheduler="image-update-check" />

            <ManualRunBox
                description="Immediately check all images against their registry, including registries paused by a rate limit."
                failureTitle="Could not run the image update check"
                onRun={async () => {
                    const data = await runJob<{ checked?: number }>("/api/v1/settings/image-update-check/run");
                    return typeof data.checked === "number" ? `${data.checked} checked` : "Done";
                }}
            />
        </section>
    );
};

export const AutoUpdateSection = ({ values, onChange }: SectionProps) => {
    // The default schedule is what a project inherits while it names none of its own, so
    // the field says how many projects that currently is.
    const projects = useProjectStore((s) => s.projects);
    const inheritingProjects = projects.filter((p) => p.autoUpdate && p.cron === null).length;
    const [cronValidation, setCronValidation] = useState<"idle" | "valid" | "invalid">("idle");

    useEffect(() => {
        if (cronValidation === "idle") return;
        const timer = setTimeout(() => setCronValidation("idle"), 3000);
        return () => clearTimeout(timer);
    }, [cronValidation]);

    const validateCron = async () => {
        try {
            const response = await apiFetch("/api/v1/settings/container-auto-update/validate-cron", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expr: values.container_auto_update_cron }),
            });
            const data = (await response.json()) as { valid: boolean };
            setCronValidation(data.valid ? "valid" : "invalid");
        } catch {
            setCronValidation("invalid");
        }
    };

    return (
        <section>
            <SectionHeader title="Container Auto-Update">
                Every agent pulls updated images and recreates containers on its own clock. A container
                takes part through the Docker label below or through a project with auto-update switched
                on; this page sets the default schedule the hosts and projects inherit.
            </SectionHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                        Cron Expression
                    </label>
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            value={values.container_auto_update_cron}
                            onChange={(e) => onChange("container_auto_update_cron", e.target.value)}
                            placeholder="0 3 * * *"
                            className="flex-1"
                        />
                        <Button
                            variant="secondary"
                            onClick={validateCron}
                            disabled={!values.container_auto_update_cron}
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
                                onClick={() => onChange("container_auto_update_cron", p.value)}
                                className={cn(
                                    "text-xs px-2 py-1 rounded border border-border hover:bg-hover",
                                    FOCUS_RING,
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed max-w-prose mt-1">
                        The default every host and project inherits while it names no schedule of its own.
                        Leave empty and only hosts and projects with an expression of their own take part.
                        Standard 5-field cron syntax (min hour dom mon dow).{" "}
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
                        value={values.container_auto_update_label}
                        onChange={(e) => onChange("container_auto_update_label", e.target.value)}
                        placeholder="dim.auto-update=true"
                    />
                    <p className="text-xs text-text-muted leading-relaxed max-w-prose">
                        Containers carrying this label are included automatically; the other way in is a
                        project with auto-update switched on. Format: <code className="font-sans">key=value</code> or
                        just <code className="font-sans">key</code> (matches any value). The same key
                        carrying <code className="font-sans">false</code> opts a container out of both.
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
                        value={values.container_auto_update_delay_label}
                        onChange={(e) => onChange("container_auto_update_delay_label", e.target.value)}
                        placeholder="dim.auto-update-delay"
                    />
                    <p className="text-xs text-text-muted leading-relaxed max-w-prose mt-1">
                        Docker label that controls the update delay per container. The label value specifies
                        the minimum age in days a new image must have before it is applied.
                        Example: <code className="font-sans">dim.auto-update-delay=3</code> delays updates by 3 days.
                        Leave empty to disable delay support.
                    </p>
                </div>
            </div>
        </section>
    );
};

export const NotificationSection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Notification History">
            Controls how long notifications are kept in the database. Old entries are removed
            automatically while always preserving a minimum number of the most recent notifications.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.notification_retention_days}
                onChange={(v) => onChange("notification_retention_days", v)}
                min={1}
                placeholder="90"
                hint="Notifications older than this are eligible for removal."
            />
            <NumberField
                label="Minimum Keep Count"
                value={values.notification_retention_count}
                onChange={(v) => onChange("notification_retention_count", v)}
                placeholder="500"
                hint="Always keep at least this many of the most recent notifications, regardless of age."
            />
            <NumberField
                label="Cleanup Interval (Hours)"
                value={values.notification_cleanup_interval_hours}
                onChange={(v) => onChange("notification_cleanup_interval_hours", v)}
                placeholder="24"
                hint="How often the automatic cleanup runs. Set to 0 to disable the scheduler (manual runs still work)."
            />
        </div>

        <SchedulerStatusBox scheduler="notification-cleanup" />

        <ManualRunBox
            description="Immediately remove notifications that exceed the saved retention settings."
            failureTitle="Could not clean up the notifications"
            onRun={async () => {
                const data = await runJob<{ removed?: number }>("/api/v1/settings/cleanup/notifications");
                return typeof data.removed === "number" ? `Removed ${data.removed}` : "Done";
            }}
        />
    </section>
);
