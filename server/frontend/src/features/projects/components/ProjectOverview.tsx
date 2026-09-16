import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Layers } from "lucide-react";
import { Button, Card, Input, StatCard, Switch } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { ManagedContainers } from "../../containers/components/ManagedContainers";
import { ManagedImages } from "../../images/components/ManagedImages";
import { LoadingIndicator } from "../../../components/LoadingIndicator";

type Tab = "containers" | "images";

const TABS: readonly Tab[] = ["containers", "images"] as const;

interface ProjectOverviewProps {
    name: string | undefined;
}

/**
 * One Compose stack across the whole fleet: its settings at the top, its members below.
 *
 * The members are not stored anywhere -- they are the containers currently carrying this
 * project's Compose label, which is why a stack may span several hosts. Both tabs are the
 * fleet-wide container and image lists from the sidebar, narrowed to this project, so a row
 * means the same thing and offers the same actions in both places.
 */
export const ProjectOverview = ({ name }: ProjectOverviewProps) => {
    const navigate = useNavigate();
    const decodedName = name ? decodeURIComponent(name) : undefined;

    const projects = useProjectStore((s) => s.projects);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const updateProject = useProjectStore((s) => s.updateProject);
    const members = useAllProjectMembers();

    const [tab, setTab] = useSearchQueryParam("tab");
    const activeTab: Tab = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : "containers";

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const project = decodedName ? projects.find((p) => p.name === decodedName) : undefined;
    const live = decodedName ? members.get(decodedName) ?? EMPTY_MEMBERS : EMPTY_MEMBERS;

    // Local copy of the schedule while it is being typed. Reseeded while rendering rather
    // than in an effect, so a change from elsewhere arrives without a second render pass.
    const [cronDraft, setCronDraft] = useState("");
    const [seededFor, setSeededFor] = useState<string | null>(null);
    const [settingError, setSettingError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    if (project && seededFor !== project.name) {
        setSeededFor(project.name);
        setCronDraft(project.cron ?? "");
    }

    const save = useCallback(
        async (changes: { autoUpdate?: boolean; cron?: string | null }) => {
            if (!project) return;
            setIsSaving(true);
            setSettingError(null);
            try {
                await updateProject(project.name, changes);
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
                    There is no project named{" "}
                    <code className="font-mono text-sm">{decodedName}</code> in DIM.
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
                        <Box size={24} className="text-text-muted" />
                        <div>
                            <h2 className="text-2xl font-bold">{project.name}</h2>
                            <div className="text-sm text-text-muted">
                                Compose project on {live.clientIds.length} host(s)
                            </div>
                        </div>
                    </div>
                }
                padding="md"
                classNames={{ content: "space-y-6" }}
            >
                <Switch
                    label="Auto-Update"
                    hint="Every container of this stack takes part in auto-update, on every host it runs on."
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

            <div className="grid grid-cols-2 gap-4">
                <StatCard
                    label="Container"
                    value={String(live.containerCount)}
                    icon={Box}
                    selected={activeTab === "containers"}
                    onClick={() => setTab("containers")}
                />
                <StatCard
                    label="Images"
                    value={String(live.imageCount)}
                    icon={Layers}
                    selected={activeTab === "images"}
                    onClick={() => setTab("images")}
                />
            </div>

            {/* Each tab keeps its own search parameter: the two lists share the page, and one
                query parameter between them would carry a container name into the images. */}
            {activeTab === "containers" && (
                <ManagedContainers
                    projectName={project.name}
                    searchParamKey="search.containers"
                />
            )}

            {activeTab === "images" && (
                <ManagedImages projectName={project.name} searchParamKey="search.images" />
            )}
        </div>
    );
};
