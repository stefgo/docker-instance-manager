import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Box, Boxes, Edit, Layers, Monitor, MoreVertical } from "lucide-react";
import {
    ActionButton,
    ActionMenu,
    Badge,
    Button,
    EntityHeader,
    type EntityDetail,
    Input,
    StatCard,
    Switch,
    TabList,
    TabPanel,
    useActionMenu,
    useTabs,
} from "@stefgo/react-ui-components";
import { getErrorMessage, plural } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { ManagedContainers } from "../../containers/components/ManagedContainers";
import { ProjectClients } from "./ProjectClients";
import { ProjectImages } from "./ProjectImages";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { MENU_ENTRY } from "../../../components/menuEntry";
import { NotFoundCard } from "../../../components/NotFoundCard";
import { describe } from "../query";

type Tab = "containers" | "images" | "clients";

const TABS: readonly Tab[] = ["containers", "images", "clients"] as const;

interface ProjectOverviewProps {
    id: string | undefined;
}

/**
 * One project across the whole fleet: its query and settings in the header, its members
 * below.
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
            <NotFoundCard title="Project not found" backTo="/projects" backLabel="Back to projects">
                There is no project with the id <code className="font-mono text-sm">{id}</code> in DIM.
            </NotFoundCard>
        );
    }

    const usesDefaultCron = project.cron === null;

    /**
     * All details open on request, like the client header. The controls save on the spot, as
     * before -- the list only lays them out.
     */
    const details: EntityDetail[] = [
        { label: "ID", value: project.id, mono: true, copyable: project.id, span: "full" },
        {
            label: "Query",
            value: project.query.length > 0 ? describe(project.query) : "–",
            mono: true,
            span: "full",
        },
        {
            label: "Auto-Update",
            value: (
                <Switch
                    label="Enabled"
                    hint="Every container of this project takes part in auto-update, on every host it runs on."
                    value={project.autoUpdate}
                    onChange={(next) => save({ autoUpdate: next })}
                    disabled={isSaving}
                />
            ),
        },
        // The schedule only matters while auto-update is on. A stored schedule is kept while
        // it is off, and shows up again when auto-update is switched on.
        ...(project.autoUpdate
            ? [
                  {
                      label: "Schedule",
                      span: "full" as const,
                      value: (
                          <div className="space-y-2">
                              {/* NULL is "inherit", not "off" -- switching auto-update off is
                                  what the control above is for. */}
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
                      ),
                  },
              ]
            : []),
    ];

    return (
        <div className="space-y-6">
            <EntityHeader
                leading={<Boxes size={24} className="text-text-muted" />}
                title={project.name}
                meta={
                    <>
                        <Badge variant={project.autoUpdate ? "success" : "neutral"}>
                            Auto-Update {project.autoUpdate ? "on" : "off"}
                        </Badge>
                        {project.autoUpdate && !usesDefaultCron && (
                            <Badge variant="neutral" className="font-mono">{project.cron}</Badge>
                        )}
                    </>
                }
                alert={
                    live.conflictCount > 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-error px-3 py-2 text-sm text-error">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>
                                {plural(live.conflictCount, "container")}{" "}
                                {live.conflictCount === 1 ? "matches" : "match"} this project and another one.
                                {live.conflictCount === 1 ? " It is" : " They are"} excluded from both projects' auto-update; one carrying the auto-update label is
                                updated on its host's schedule instead. Narrow one of the queries to resolve it —
                                the containers are marked in the list below.
                            </span>
                        </div>
                    )
                }
                details={details}
                // Names the view, not the project: one entry for every project page.
                persist={{ key: "dim.project.details", scope: "local" }}
                actions={
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
            />

            {/* Outside the header, so a failed save stays in view after the details close. */}
            {settingError && <p className="text-sm text-error">{settingError}</p>}

            <TabList tabs={tabs} aria-label="Project views" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    {...tabs.tabProps("clients")}
                    label="Clients"
                    value={String(live.clientIds.length)}
                    icon={Monitor}
                />
                <StatCard
                    {...tabs.tabProps("containers")}
                    label="Containers"
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
