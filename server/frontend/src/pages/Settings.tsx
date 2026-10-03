import { useState, useEffect, useCallback } from "react";
import { Save, Settings as SettingsIcon } from "lucide-react";
import {
    Button,
    Card,
    cn,
    FOCUS_RING_INSET,
    TabList,
    TabPanel,
    useConfirm,
    useTabs,
    useToast,
    LoadingIndicator,
} from "@stefgo/react-ui-components";
import { SchedulerStatusResponseSchema, SettingsResponseSchema, type SchedulerStatuses } from "@dim/shared";
import { useSchedulerStore } from "../stores/useSchedulerStore";
import { useSearchQueryParam } from "../hooks/useSearchQueryParam";
import { describeFailure, getErrorMessage } from "../utils";
import { api } from "../lib/api";
import {
    DEFAULT_SETTINGS,
    SECTIONS,
    SECTION_IDS,
    isDirty,
    type SectionDef,
    type SectionId,
    settingsFrom,
    type SettingsValues,
} from "../features/settings/sections";
import {
    AutoUpdateSection,
    ImageCacheSection,
    ImageUpdateCheckSection,
    ActivitySection,
    TokenRetentionSection,
} from "../features/settings/components/SettingsSections";

/** Loads the scheduler status without touching state. */
const requestSchedulerStatus = () =>
    api.get("/api/v1/settings/scheduler-status", SchedulerStatusResponseSchema, {
        fallback: "Could not load the scheduler status",
    });

// The tab fills the sidebar's width, so the ring is drawn inside it -- an outward one would
// be clipped by the panel border next to it.
const TAB_CLASS = cn(
    "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition duration-200 cursor-pointer border-l-4 border-transparent hover:bg-hover",
    FOCUS_RING_INSET,
);
const TAB_SELECTED_CLASS =
    "bg-primary/10 text-primary border-l-primary shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-primary/10";

/**
 * The server's own settings, one section per tab.
 *
 * Each section saves on its own and sends only its own keys; the server merges them into the
 * stored block. It used to be one Save under all five tabs, which wrote whatever had been
 * touched anywhere -- including edits in a tab that was no longer on screen. A tab with
 * edits that are not saved yet carries a dot, so they are not forgotten either.
 *
 * The open tab is in the URL, like the tabs of the client and project pages.
 */
export default function Settings() {
    const { alert } = useConfirm();
    const { show } = useToast();

    /** What the server holds, as last loaded or saved. */
    const [saved, setSaved] = useState<SettingsValues>(DEFAULT_SETTINGS);
    /** What the fields show, saved or not. */
    const [draft, setDraft] = useState<SettingsValues>(DEFAULT_SETTINGS);
    const [savingSection, setSavingSection] = useState<SectionId | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const setSchedulers = useSchedulerStore((s) => s.setSchedulers);

    const [tab, setTab] = useSearchQueryParam("tab");
    const tabs = useTabs({
        tabs: SECTION_IDS,
        value: (SECTION_IDS as readonly string[]).includes(tab) ? tab : SECTION_IDS[0],
        onChange: setTab,
        orientation: "vertical",
    });

    // Split into a request that touches no state and a function that applies its answer:
    // the effect below may only set state once the response is there, and a save loads the
    // status again afterwards. The store setter is stable.
    const applySchedulerStatus = useCallback((data: { schedulers: SchedulerStatuses }) => {
        setSchedulers(data.schedulers);
    }, [setSchedulers]);

    // Settings and scheduler status are loaded once, inside the effect. isLoading starts
    // out true, so the load only ever has to lower it.
    useEffect(() => {
        let cancelled = false;
        const loadSettings = async () => {
            try {
                const data = await api.get("/api/v1/settings/cleanup", SettingsResponseSchema);
                if (!cancelled) {
                    const loaded = settingsFrom(data);
                    setSaved(loaded);
                    setDraft(loaded);
                }
            } catch (e) {
                // The form then shows the defaults, which are not what the server holds.
                if (!cancelled) {
                    show({ variant: "error", title: "Could not load the settings", description: getErrorMessage(e) });
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        loadSettings();
        requestSchedulerStatus()
            .then((data) => {
                if (!cancelled) applySchedulerStatus(data);
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    show({ variant: "error", title: "Could not load the scheduler status", description: getErrorMessage(e) });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [applySchedulerStatus, show]);

    const change = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

    const save = async (section: SectionDef) => {
        const body = Object.fromEntries(section.keys.map((key) => [key, draft[key] ?? ""]));
        setSavingSection(section.id);
        try {
            // The endpoint validates the body and names the offending field.
            await api.put("/api/v1/settings/cleanup", body, undefined, { fallback: "Failed to save settings" });
            setSaved((prev) => ({ ...prev, ...body }));
            show({ variant: "success", title: `${section.label} saved` });
        } catch (e: unknown) {
            alert(describeFailure("Could not save the settings", e));
            return;
        } finally {
            setSavingSection(null);
        }
        // A changed interval moves the next scheduled run. Read after the save has been
        // reported: the settings are stored, whatever becomes of this.
        try {
            applySchedulerStatus(await requestSchedulerStatus());
        } catch (e: unknown) {
            show({ variant: "error", title: "Could not load the scheduler status", description: getErrorMessage(e) });
        }
    };

    if (isLoading) {
        return <LoadingIndicator label="Loading settings…" />;
    }

    const renderSection = (id: SectionId) => {
        switch (id) {
            case "tokens":
                return <TokenRetentionSection values={draft} onChange={change} />;
            case "image-cache":
                return <ImageCacheSection values={draft} onChange={change} />;
            case "image-check":
                return <ImageUpdateCheckSection values={draft} onChange={change} />;
            case "auto-update":
                return <AutoUpdateSection values={draft} onChange={change} />;
            case "activity":
                return <ActivitySection values={draft} onChange={change} />;
        }
    };

    return (
        <Card
            title={
                <>
                    <SettingsIcon size={18} className="text-text-muted" /> System Settings
                </>
            }
            className="overflow-visible"
            padding="none"
        >
            <div className="flex flex-col md:flex-row min-h-[450px]">
                {/* The card is overflow-visible, so its rounded corner does not clip the
                    sidebar's background; the sidebar rounds that corner itself. */}
                <TabList
                    tabs={tabs}
                    aria-label="Settings sections"
                    className="w-full md:w-64 shrink-0 bg-app-bg border-b md:border-b-0 md:border-r md:rounded-bl-lg border-border py-4 flex flex-col gap-1"
                >
                    {SECTIONS.map((section) => {
                        const { selected, ...tabAttributes } = tabs.tabProps(section.id);
                        const dirty = isDirty(section, draft, saved);
                        return (
                            <button
                                key={section.id}
                                type="button"
                                {...tabAttributes}
                                className={cn(TAB_CLASS, selected && TAB_SELECTED_CLASS)}
                            >
                                <section.icon size={18} />
                                <span className="flex-1">{section.label}</span>
                                {dirty && (
                                    <>
                                        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-warning" />
                                        <span className="sr-only">(unsaved changes)</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </TabList>

                <div className="flex-1 min-w-0 flex flex-col">
                    {SECTIONS.map((section) => (
                        <TabPanel
                            key={section.id}
                            tabs={tabs}
                            value={section.id}
                            className="flex-1 flex flex-col px-8 pt-8 pb-4 animate-in fade-in slide-in-from-right-2 duration-300"
                        >
                            <div className="flex-1 flex flex-col gap-8">
                                {renderSection(section.id)}

                                <div className="mt-auto flex justify-end border-t border-border pt-4">
                                    <Button
                                        variant="primary"
                                        icon={Save}
                                        onClick={() => save(section)}
                                        disabled={!isDirty(section, draft, saved) || savingSection !== null}
                                        isLoading={savingSection === section.id}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </TabPanel>
                    ))}
                </div>
            </div>
        </Card>
    );
}
