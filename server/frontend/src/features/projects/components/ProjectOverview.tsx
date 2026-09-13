import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Layers, Monitor } from "lucide-react";
import { CLIENT_STATUS, DockerActionType } from "@dim/shared";
import { Button, Card, ConfirmDialog, Input, StatCard, Switch } from "@stefgo/react-ui-components";
import { apiFetch } from "../../../lib/apiFetch";
import { getErrorMessage } from "../../../utils";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { ClientList } from "../../clients/components/ClientList";
import { ClientContainerList } from "../../clients/components/ClientContainerList";
import { ClientImageList } from "../../clients/components/ClientImageList";
import { describeRemove, REMOVE_ACTIONS } from "../../clients/dockerRemove";
import { LoadingIndicator } from "../../../components/LoadingIndicator";

type Tab = "clients" | "containers" | "images";

const TABS: readonly Tab[] = ["clients", "containers", "images"] as const;

interface ProjectOverviewProps {
    name: string | undefined;
}

/**
 * One Compose stack across the whole fleet: its settings at the top, its members below.
 *
 * The members are not stored anywhere -- they are the containers currently carrying this
 * project's Compose label, which is why a stack may span several hosts and why each of the
 * three tabs is grouped by host.
 */
export const ProjectOverview = ({ name }: ProjectOverviewProps) => {
    const navigate = useNavigate();
    const decodedName = name ? decodeURIComponent(name) : undefined;

    const projects = useProjectStore((s) => s.projects);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const updateProject = useProjectStore((s) => s.updateProject);
    const clients = useClientStore((s) => s.clients);
    const getDockerState = useDockerStore((s) => s.getDockerState);
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

    const memberClients = useMemo(
        () => clients.filter((c) => live.clientIds.includes(c.id)),
        [clients, live.clientIds],
    );

    const clientNameOf = useCallback(
        (clientId: string) => {
            const client = clients.find((c) => c.id === clientId);
            return client?.displayName || client?.hostname || clientId;
        },
        [clients],
    );

    // Actions go to the host the row is on, which is why the pending removal carries the
    // client with it. Everything else follows the client overview: removals ask first.
    const [pendingRemove, setPendingRemove] = useState<{
        clientId: string;
        action: DockerActionType;
        target: string;
    } | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const sendAction = async (
        clientId: string,
        action: DockerActionType,
        target: string,
    ): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/v1/clients/${clientId}/docker/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, target }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Action failed");
            return true;
        } catch (e: unknown) {
            alert(getErrorMessage(e));
            return false;
        }
    };

    const handleAction = async (clientId: string, action: DockerActionType, target: string) => {
        if (REMOVE_ACTIONS.has(action)) {
            setPendingRemove({ clientId, action, target });
            return;
        }
        await sendAction(clientId, action, target);
    };

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setIsRemoving(true);
        try {
            if (await sendAction(pendingRemove.clientId, pendingRemove.action, pendingRemove.target)) {
                setPendingRemove(null);
            }
        } finally {
            setIsRemoving(false);
        }
    };

    const removeDialog = pendingRemove
        ? describeRemove(
              pendingRemove.action,
              pendingRemove.target,
              getDockerState(pendingRemove.clientId),
          )
        : null;

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
                        <Boxes size={24} className="text-text-muted" />
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

                {settingError && <p className="text-sm text-error">{settingError}</p>}
            </Card>

            <div className="grid grid-cols-3 gap-4">
                <StatCard
                    label="Clients"
                    value={String(live.clientIds.length)}
                    icon={Monitor}
                    selected={activeTab === "clients"}
                    onClick={() => setTab("clients")}
                />
                <StatCard
                    label="Container"
                    value={String(live.containerCount)}
                    icon={Boxes}
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

            {live.perClient.length === 0 ? (
                <p className="text-text-muted text-sm py-8 text-center">
                    No container of this stack is running on any host right now.
                </p>
            ) : (
                <>
                    {activeTab === "clients" && (
                        <ClientList
                            clients={memberClients}
                            setSelectedClient={(c) => c && navigate(`/client/${c.id}`)}
                        />
                    )}

                    {/* One list per host: a stack may run on several, and its container and
                        image actions are addressed to one host each. */}
                    {activeTab === "containers" &&
                        live.perClient.map((m) => (
                            <div key={m.clientId} className="space-y-2">
                                <ClientHeading
                                    name={clientNameOf(m.clientId)}
                                    online={
                                        clients.find((c) => c.id === m.clientId)?.status ===
                                        CLIENT_STATUS.ONLINE
                                    }
                                />
                                <ClientContainerList
                                    clientId={m.clientId}
                                    containers={m.containers}
                                    onAction={(action, target) => handleAction(m.clientId, action, target)}
                                    searchParamKey={`search.containers.${m.clientId}`}
                                />
                            </div>
                        ))}

                    {activeTab === "images" &&
                        live.perClient.map((m) => (
                            <div key={m.clientId} className="space-y-2">
                                <ClientHeading
                                    name={clientNameOf(m.clientId)}
                                    online={
                                        clients.find((c) => c.id === m.clientId)?.status ===
                                        CLIENT_STATUS.ONLINE
                                    }
                                />
                                <ClientImageList
                                    images={m.images}
                                    onAction={(action, target) => handleAction(m.clientId, action, target)}
                                    searchParamKey={`search.images.${m.clientId}`}
                                />
                            </div>
                        ))}
                </>
            )}

            <ConfirmDialog
                isOpen={!!pendingRemove}
                onClose={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
                title={removeDialog?.title ?? ""}
                description={removeDialog?.description}
                confirmLabel={removeDialog?.confirmLabel}
                variant="danger"
                isConfirming={isRemoving}
            />
        </div>
    );
};

const ClientHeading = ({ name, online }: { name: string; online: boolean }) => (
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted">
        <Monitor size={14} /> {name}
        {!online && <span className="font-normal normal-case">(offline)</span>}
    </div>
);
