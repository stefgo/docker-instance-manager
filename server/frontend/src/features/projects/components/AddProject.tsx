import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button, Card, Input, Switch, cn, FOCUS_RING } from "@stefgo/react-ui-components";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers } from "../hooks/useProjectMembers";
import { getErrorMessage } from "../../../utils";

const DEFAULT_CRON = "0 3 * * *";

/**
 * Adds a project. A page of its own, at `/projects/new`, laid out like the add-client flow --
 * the same card, the same footer, the same ways out -- but without its steps: a project is a
 * name and its settings, and there is no decision in it that the rest would follow from.
 */
export const AddProject = () => {
    const navigate = useNavigate();
    const { state } = useLocation();
    const back = (state as { from?: string } | null)?.from ?? "/projects";

    const projects = useProjectStore((s) => s.projects);
    const discovered = useProjectStore((s) => s.discovered);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const createProject = useProjectStore((s) => s.createProject);
    const members = useAllProjectMembers();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // A stack the hosts report that has no entry yet. The store's list is the server's view
    // of it; anything the live state has picked up since is added here.
    const suggestions = useMemo(() => {
        const known = new Set(projects.map((p) => p.name));
        const names = new Set([...discovered, ...members.keys()]);
        return [...names].filter((n) => !known.has(n)).sort();
    }, [discovered, members, projects]);

    const [name, setName] = useState("");
    const [autoUpdate, setAutoUpdate] = useState(false);
    const [useDefaultCron, setUseDefaultCron] = useState(true);
    const [cron, setCron] = useState(DEFAULT_CRON);
    const [error, setError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const close = () => navigate(back);

    // On `window`, one level further out than menus and dialogs, as in the add-client flow.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            navigate(back);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [navigate, back]);

    const trimmedName = name.trim();
    // The schedule only matters while auto-update is on; with it off, it is neither asked for
    // nor sent, and the project inherits the default should auto-update be switched on later.
    const ownCron = autoUpdate && !useDefaultCron;
    const canAdd = trimmedName.length > 0 && (!ownCron || cron.trim().length > 0);

    const add = async () => {
        if (!canAdd || isAdding) return;
        setIsAdding(true);
        setError(null);
        try {
            await createProject({
                name: trimmedName,
                autoUpdate,
                cron: ownCron ? cron.trim() : null,
            });
            close();
        } catch (e: unknown) {
            // Stays on the page with the message beside the button that retries it -- the
            // most likely failures are a name that is already managed or a malformed schedule.
            setError(getErrorMessage(e));
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <Card
            title="Add Project"
            classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    add();
                }}
            >
                <div className="px-6 py-4 space-y-6">
                    <p className="text-sm text-text-muted">
                        A project is a Compose stack, identified by its project name. DIM only
                        stores the name and its settings — which containers belong to it is read
                        off the hosts.
                    </p>

                    <div className="space-y-4">
                        <Input
                            label="Project Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="nextcloud"
                            hint="The value of com.docker.compose.project. A stack that is not deployed yet can be added too."
                            required
                            autoFocus
                        />

                        {suggestions.length > 0 && (
                            <div>
                                <span className="block text-xs font-bold text-text-muted uppercase mb-1">
                                    Found on the hosts
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {suggestions.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setName(s)}
                                            className={cn(
                                                "text-xs px-2 py-1 rounded border transition-colors",
                                                s === trimmedName
                                                    ? "border-primary bg-hover"
                                                    : "border-border hover:bg-hover",
                                                FOCUS_RING,
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <Switch
                        label="Auto-Update"
                        hint="Every container of this stack takes part in auto-update, on every host it runs on."
                        value={autoUpdate}
                        onChange={setAutoUpdate}
                    />

                    {autoUpdate && (
                        <div className="space-y-4">
                            {/* NULL is "inherit", not "off" -- switching auto-update off is what
                                the control above is for. */}
                            <Switch
                                label="Use the default schedule"
                                hint="The schedule from the settings applies while this is on."
                                value={useDefaultCron}
                                onChange={setUseDefaultCron}
                            />

                            {!useDefaultCron && (
                                <Input
                                    label="Cron Expression"
                                    value={cron}
                                    onChange={(e) => setCron(e.target.value)}
                                    placeholder={DEFAULT_CRON}
                                    className="font-mono"
                                    required
                                />
                            )}
                        </div>
                    )}

                    {error && <p className="text-sm text-error">{error}</p>}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                    <Button type="button" variant="ghost" onClick={close} disabled={isAdding}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        icon={Plus}
                        disabled={!canAdd}
                        isLoading={isAdding}
                    >
                        Add Project
                    </Button>
                </div>
            </form>
        </Card>
    );
};
