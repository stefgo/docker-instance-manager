import { Bell, Database, Repeat, SearchCheck, Sliders, type LucideIcon } from "lucide-react";

/** The settings block as the API sends it: every value a string, whatever it means. */
export type SettingsValues = Record<string, string>;

export type SectionId = "tokens" | "image-cache" | "image-check" | "auto-update" | "notifications";

export interface SectionDef {
    id: SectionId;
    label: string;
    icon: LucideIcon;
    /**
     * The keys this section edits, and so the keys its Save sends. The server merges what
     * arrives into the stored block, so a section never writes over another section's edits.
     */
    keys: readonly string[];
}

export const SECTIONS: readonly SectionDef[] = [
    {
        id: "tokens",
        label: "Client Tokens",
        icon: Sliders,
        keys: ["token_retention_days", "token_cleanup_interval_hours"],
    },
    {
        id: "image-cache",
        label: "Image Version Cache",
        icon: Database,
        keys: [
            "image_version_cache_ttl_days",
            "image_version_cache_cleanup_orphans",
            "image_version_cache_cleanup_interval_hours",
        ],
    },
    {
        id: "image-check",
        label: "Image Update Check",
        icon: SearchCheck,
        keys: ["image_update_check_interval_seconds"],
    },
    {
        id: "auto-update",
        label: "Container Auto-Update",
        icon: Repeat,
        keys: [
            "container_auto_update_cron",
            "container_auto_update_label",
            "container_auto_update_delay_label",
        ],
    },
    {
        id: "notifications",
        label: "Notification History",
        icon: Bell,
        keys: [
            "notification_retention_days",
            "notification_retention_count",
            "notification_cleanup_interval_hours",
        ],
    },
];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** What a section shows until the server has answered -- the server's own defaults. */
export const DEFAULT_SETTINGS: SettingsValues = {
    token_retention_days: "30",
    token_cleanup_interval_hours: "24",
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
};

/** Whether the draft differs from what the server holds in any of the section's keys. */
export const isDirty = (section: SectionDef, draft: SettingsValues, saved: SettingsValues): boolean =>
    section.keys.some((key) => (draft[key] ?? "") !== (saved[key] ?? ""));

/** Props every section component takes: its values, and a way to change one of them. */
export interface SectionProps {
    values: SettingsValues;
    onChange: (key: string, value: string) => void;
}
