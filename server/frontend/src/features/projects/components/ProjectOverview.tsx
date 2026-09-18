import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Box, Boxes, Edit, Layers, Monitor, MoreVertical } from "lucide-react";
import {
    ActionButton,
    ActionMenu,
    Button,
    Card,
    cn,
    FOCUS_RING_NONE,
    Input,
    StatCard,
    Switch,
    TabList,
    TabPanel,
    useActionMenu,
    useTabs,
} from "@stefgo/react-ui-components";
import { getErrorMessage } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { ManagedContainers } from "../../containers/components/ManagedContainers";
import { ProjectClients } from "./ProjectClients";
import { ProjectImages } from "./ProjectImages";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { describe } from "../query";

type Tab = "containers" | "images" | "clients";

const TABS: readonly Tab[] = ["containers", "images", "clients"] as const;

/**
 * A menu entry marks focus with its background, the way the menu's own entries do -- a ring
 * inside the popover would be clipped by it. Same entry style as the client overview's menu.
 */
const MENU_ENTRY = cn(
    "w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover focus-visible:bg-hover flex items-center gap-2",
    FOCUS_RING_NONE,
);

interface ProjectOverviewProps {
    id: string | undefined;
}

/**
 * One project across the whole fleet: its settings at the top, its members below.
 *
 * The members are not stored anywhere -- they are the containers its query currently
 * matches, which is why a project may span several hosts. The container tab is the
 * fleet-wide list from the sidebar, narrowed to this project, so a row means the same thing
 * and offers the same actions in both places; the other two tabs group the same members by
 * the image they were built from and by the host they run on.
 */
export const ProjectOverview = ({ id }: ProjectOverviewProps) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const projects = useProjectStore((s) => s.projects);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const updateProject = useProjectStore((s) => s.updateProject);
    const members = useAllProjectMembers();

    const [tab, setTab] = useSearchQueryParam("tab");
    // In the URL, so a reload and a shared link land on the same tab. Without a `tab`
    // parameter the page opens on the clients, the coarsest of the three views: a project
    // spans hosts, and its hosts are what a first look is after.
    const tabs = useTabs({
        tabs: TABS,
        value: (TABS as readonly string[]).includes(tab) ? tab : "clients",
        onChange: setTab,
    });
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const project = id ? projects.find((p) => p.id === id) : undefined;
    const live = id ? members.get(id) ?? EMPTY_MEMBERS : EMPTY_MEMBERS;

    // Local copy of the schedule while it is being typed. Reseeded while rendering rather
    // than in an effect, so a change from elsewhere arrives without a second render pass.
    const [cronDraft, setCronDraft] = useState("");
    const [seededFor, setSeededFor] = useState<string | null>(null);
    const [settingError, setSettingError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    if (project && seededFor !== project.id) {
        setSeededFor(project.id);
        setCronDraft(project.cron ?? "");
    }

    const save = useCallback(
        async (changes: { autoUpdate?: boolean; cron?: string | null }) => {
            if (!project) return;
            setIsSaving(true);
            setSettingError(null);
            try {
                await updateProject(project.id, changes);
            } catch (e: unknown) {
                setSettingError(getErrorMessage(e));
            } finally {
                setIsSaving(false);
            }
        },
        [project, updateProject],
    );

    if (!project) {
        return projects.length === 0 ? (
            <LoadingIndicator label="Loading projects…" />
        ) : (
            <Card title="Project not found" padding="md" classNames={{ content: "space-y-4" }}>
                <p className="text-text-secondary">
                    There is no project with the id{" "}
                    <code className="font-mono text-sm">{id}</code> in DIM.
                </p>
                <Button variant="secondary" onClick={() => navigate("/projects")}>
                    Back to projects
                </Button>
            </Card>
        );
    }

    const usesDefaultCron = project.cron === null;

    return (
        <div className="space-y-6">
            <Card
                title={
                    <div className="flex items-center gap-4">
                        <Boxes size={24} className="text-text-muted" />
                        <div>
                            <h2 className="text-2xl font-bold">{project.name}</h2>
                            <div className="font-mono text-sm text-text-muted">{project.id}</div>
                        </div>
                    </div>
                }
                action={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Project actions"
                            onClick={(e) => openMenu(e, project.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === project.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <button
                                onClick={() => {
                                    // `from` is how the editor knows that back is this
                                    // page and not the project list.
                                    navigate(`/project/${encodeURIComponent(project.id)}/edit`, {
                                        state: { from: pathname },
                                    });
                                    closeMenu();
                                }}
                                className={MENU_ENTRY}
                            >
                                <Edit size={16} /> Edit Query
                            </button>
                        </ActionMenu>
                    </div>
                }
                padding="md"
                classNames={{ content: "space-y-6" }}
            >
                {live.conflictCount > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-error px-3 py-2 text-sm text-error">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>
                            {live.conflictCount} container(s) match this project and another one. They are
                            excluded from both projects' auto-update; one carrying the auto-update label is
                            updated on its host's schedule instead. Narrow one of the queries to resolve it —
                            the containers are marked in the list below.
                        </span>
                    </div>
                )}

                <div>
                    <span className="block text-xs font-bold text-text-muted uppercase mb-1">Query</span>
                    <code className="block font-mono text-sm break-words">
                        {project.query.length > 0 ? describe(project.query) : "–"}
                    </code>
                </div>

                <Switch
                    label="Auto-Update"
                    hint="Every container of this project takes part in auto-update, on every host it runs on."
                    value={project.autoUpdate}
                    onChange={(next) => save({ autoUpdate: next })}
                    disabled={isSaving}
                />

                {/* The schedule only matters while auto-update is on. A stored schedule is
                    kept while it is off, and shows up again when auto-update is switched on. */}
                {project.autoUpdate && (
                    <div className="space-y-2">
                        {/* NULL is "inherit", not "off" -- switching auto-update off is what the
                            control above is for. */}
                        <Switch
                            label="Use the default schedule"
                            hint="The schedule from the settings applies while this is on."
                            value={usesDefaultCron}
                            onChange={(next) => save({ cron: next ? null : cronDraft.trim() || "0 3 * * *" })}
                            disabled={isSaving}
                        />

                        {!usesDefaultCron && (
                            <div className="flex gap-2 items-end">
                                <Input
                                    label="Cron Expression"
                                    value={cronDraft}
                                    onChange={(e) => setCronDraft(e.target.value)}
                                    placeholder="0 3 * * *"
                                    className="font-mono flex-1"
                                />
                                <Button
                                    variant="secondary"
                                    onClick={() => save({ cron: cronDraft })}
                                    disabled={isSaving || cronDraft.trim() === (project.cron ?? "")}
                                >
                                    Save
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {settingError && <p className="text-sm text-error">{settingError}</p>}
            </Card>

            <TabList tabs={tabs} aria-label="Project views" className="grid grid-cols-3 gap-4">
                <StatCard
                    {...tabs.tabProps("clients")}
                    label="Clients"
                    value={String(live.clientIds.length)}
                    icon={Monitor}
                />
                <StatCard
                    {...tabs.tabProps("containers")}
                    label="Container"
                    value={String(live.containerCount)}
                    icon={Box}
                />
                <StatCard
                    {...tabs.tabProps("images")}
                    label="Images"
                    value={String(live.imageCount)}
                    icon={Layers}
                />
            </TabList>

            {/* Each tab keeps its own search parameter: the two lists share the page, and one
                query parameter between them would carry a container name into the images. */}
            <TabPanel tabs={tabs} value="containers">
                <ManagedContainers
                    projectId={project.id}
                    searchParamKey="search.containers"
                />
            </TabPanel>

            <TabPanel tabs={tabs} value="images">
                <ProjectImages projectId={project.id} searchParamKey="search.images" />
            </TabPanel>

            <TabPanel tabs={tabs} value="clients">
                <ProjectClients projectId={project.id} searchParamKey="search.clients" />
            </TabPanel>
        </div>
    );
};
