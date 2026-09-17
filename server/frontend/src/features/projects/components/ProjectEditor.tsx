import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Save, X } from "lucide-react";
import {
    CLIENT_STATUS,
    ProjectQuery,
    composeProjectOf,
    containerNameOf,
    findQueryConflicts,
    matchCriterion,
    matchQuery,
} from "@dim/shared";
import { ActionButton, Button, Card, Input, cn, FOCUS_RING } from "@stefgo/react-ui-components";
import { findProject, useProjectStore } from "../../../stores/useProjectStore";
import { useClientStore } from "../../../stores/useClientStore";
import { useHostStates } from "../hooks/useProjectMembers";
import { collectSuggestions, completeCriteria, newCriterion } from "../query";
import { getErrorMessage } from "../../../utils";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { QueryBuilder } from "./QueryBuilder";
import { QueryResultRow, QueryResultTable } from "./QueryResultTable";

interface ProjectEditorProps {
    /** The project to edit; without one, a new project is created. */
    projectId?: string;
}

/**
 * Creates or edits a project: its name and the query that decides which containers belong
 * to it. Auto-update is set on the project's overview, not here. The query is evaluated live against the fleet while it
 * is written, so the result table below always shows what saving would mean -- including
 * the containers another project already has, which a save refuses.
 */
export const ProjectEditor = ({ projectId }: ProjectEditorProps) => {
    const navigate = useNavigate();
    const { state } = useLocation();
    const isNew = projectId === undefined;
    const fallback = isNew ? "/projects" : `/project/${encodeURIComponent(projectId)}`;
    const back = (state as { from?: string } | null)?.from ?? fallback;

    const projects = useProjectStore((s) => s.projects);
    const discovered = useProjectStore((s) => s.discovered);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const createProject = useProjectStore((s) => s.createProject);
    const updateProject = useProjectStore((s) => s.updateProject);
    const clients = useClientStore((s) => s.clients);
    const hostStates = useHostStates();

    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            await fetchProjects();
            if (!cancelled) setLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [fetchProjects]);

    const project = findProject(projects, projectId);

    const [name, setName] = useState("");
    const [query, setQuery] = useState<ProjectQuery>(() => [newCriterion()]);
    const [error, setError] = useState<string | null>(null);
    /** "Enter a name" appears once the field has been left empty, not on an untouched form. */
    const [nameTouched, setNameTouched] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    /**
     * The project ids that existed when saving started. The server broadcasts the new list
     * before its answer arrives, and without this the project being created would, for a
     * moment, conflict with itself and take its own name.
     */
    const [savingFrom, setSavingFrom] = useState<Set<string> | null>(null);
    const otherProjects = useMemo(
        () => (savingFrom ? projects.filter((p) => savingFrom.has(p.id)) : projects),
        [projects, savingFrom],
    );

    // Seeded while rendering rather than in an effect, once the project has arrived.
    const [seededFor, setSeededFor] = useState<string | null>(null);
    if (project && seededFor !== project.id) {
        setSeededFor(project.id);
        setName(project.name);
        setQuery(project.query.length > 0 ? project.query : [newCriterion()]);
    }

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

    const suggestions = useMemo(() => collectSuggestions(hostStates), [hostStates]);
    const evaluable = useMemo(() => completeCriteria(query), [query]);

    const hitCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const criterion of evaluable) {
            let n = 0;
            for (const s of hostStates) {
                for (const c of s.containers) if (matchCriterion(criterion, s.host, c)) n++;
            }
            counts.set(criterion.id, n);
        }
        return counts;
    }, [evaluable, hostStates]);

    const conflicts = useMemo(
        () => (evaluable.length > 0 ? findQueryConflicts(evaluable, otherProjects, hostStates, projectId) : []),
        [evaluable, otherProjects, hostStates, projectId],
    );

    const rows = useMemo<QueryResultRow[]>(() => {
        if (evaluable.length === 0) return [];
        const clientsById = new Map(clients.map((c) => [c.id, c]));
        const byId = new Map(evaluable.map((c) => [c.id, c]));
        const conflictByKey = new Map(conflicts.map((c) => [`${c.clientId}/${c.containerId}`, c.projectName]));
        const result: QueryResultRow[] = [];
        for (const s of hostStates) {
            for (const container of s.containers) {
                if (!matchQuery(evaluable, s.host, container)) continue;
                const key = `${s.clientId}/${container.id}`;
                const client = clientsById.get(s.clientId);
                result.push({
                    key,
                    clientName: client ? client.displayName || client.hostname : s.clientId,
                    clientOnline: client?.status === CLIENT_STATUS.ONLINE,
                    containerName: containerNameOf(container),
                    composeProject: composeProjectOf(container),
                    image: container.configImage ?? container.image,
                    state: container.state,
                    // Numbered as the rows are, including rows still without a value.
                    matchedCriteria: query.flatMap((c, i) => {
                        const criterion = byId.get(c.id);
                        return criterion && matchCriterion(criterion, s.host, container) ? [i + 1] : [];
                    }),
                    conflictWith: conflictByKey.get(key) ?? null,
                });
            }
        }
        return result;
    }, [evaluable, query, hostStates, clients, conflicts]);

    const clientCount = new Set(rows.map((r) => r.key.split("/")[0])).size;
    const conflictProjects = [...new Set(conflicts.map((c) => c.projectName))];

    const trimmedName = name.trim();
    const nameTaken = otherProjects.some((p) => p.name === trimmedName && p.id !== projectId);
    const incomplete = query.some((c) => !c.value.trim());
    const canSave = trimmedName.length > 0 && !nameTaken && !incomplete && conflicts.length === 0;

    /** A discovered stack becomes a criterion: filled into an empty first row, or added with OR. */
    const addComposeProject = (stack: string) => {
        const criterion = newCriterion({ field: "container.composeProject", value: stack });
        if (query.length === 1 && !query[0].value.trim()) {
            setQuery([criterion]);
        } else {
            setQuery([...query, { ...criterion, join: "or" }]);
        }
        if (!trimmedName) setName(stack);
    };

    const usedStacks = new Set(
        query.filter((c) => c.field === "container.composeProject" && c.op === "equals").map((c) => c.value.trim()),
    );
    const stackSuggestions = discovered.filter((d) => !usedStacks.has(d));

    const save = async () => {
        if (!canSave || isSaving) return;
        setIsSaving(true);
        setSavingFrom(new Set(projects.map((p) => p.id)));
        setError(null);
        // A new project starts with auto-update off; an existing one keeps its settings.
        const input = { name: trimmedName, query: completeCriteria(query) };
        try {
            if (isNew) {
                const created = await createProject({ ...input, autoUpdate: false, cron: null });
                navigate(`/project/${encodeURIComponent(created.id)}`, { replace: true });
            } else {
                await updateProject(projectId, input);
                close();
            }
        } catch (e: unknown) {
            // Stays on the page with the message beside the button that retries it. A
            // conflict the live check did not see (a container that appeared meanwhile)
            // arrives here too.
            setError(getErrorMessage(e));
            setSavingFrom(null);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isNew && !project) {
        return loaded ? (
            <Card title="Project not found" padding="md" classNames={{ content: "space-y-4" }}>
                <p className="text-text-secondary">This project does not exist (any more).</p>
                <Button variant="secondary" onClick={() => navigate("/projects")}>
                    Back to projects
                </Button>
            </Card>
        ) : (
            <LoadingIndicator label="Loading project…" />
        );
    }

    return (
        // noValidate: the fields are checked by `save`, whose messages sit beside the field;
        // `required` stays for the asterisk and for assistive technology.
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <Card
                title={isNew ? "Add Project" : "Edit Project Query"}
                action={<ActionButton icon={X} tooltip="Close" onClick={close} disabled={isSaving} />}
                classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
            >
                <div className="px-6 py-4 space-y-6">
                    <p className="text-sm text-text-muted">
                        A project groups containers across all hosts. Which containers belong to it is
                        decided by the query below and resolved live from what the hosts report. A
                        container can belong to one project only.
                    </p>

                    <Input
                        label="Project Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => setNameTouched(true)}
                        placeholder="nextcloud"
                        error={
                            nameTaken
                                ? "A project of that name already exists"
                                : nameTouched && !trimmedName
                                  ? "Enter a name"
                                  : undefined
                        }
                        required
                        autoFocus={isNew}
                    />

                    {/* Query and result form one framed block: what is defined above is what the
                        table below shows, evaluated live. */}
                    <section aria-labelledby="project-query-heading">
                        <span
                            id="project-query-heading"
                            className="block text-xs font-bold text-text-muted uppercase mb-1.5 ml-1"
                        >
                            Query
                        </span>
                        <div className="rounded-lg border border-border overflow-hidden">
                            <div className="p-4 space-y-3">
                                <span className="block text-sm text-text-muted">
                                    Select containers by their client, their own name or Compose project, or their
                                    image. Join criteria with AND or OR — they are applied from top to bottom.
                                </span>

                                {stackSuggestions.length > 0 && (
                                    <div>
                                        <span className="block text-xs text-text-muted mb-1">
                                            Compose projects not yet in a project — click to add as a criterion:
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {stackSuggestions.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => addComposeProject(s)}
                                                    className={cn(
                                                        "text-xs px-2 py-1 rounded border border-border hover:bg-hover transition-colors",
                                                        FOCUS_RING,
                                                    )}
                                                >
                                                    + {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <QueryBuilder
                                    query={query}
                                    onChange={setQuery}
                                    suggestions={suggestions}
                                    hitCounts={hitCounts}
                                />
                            </div>

                            <div className="border-t border-border">
                                <div className="flex items-center gap-2 px-4 py-2 bg-card-header">
                                    <span className="text-xs font-bold text-text-muted uppercase">
                                        {evaluable.length === 0
                                            ? "Result · waiting for a complete criterion"
                                            : `Result · ${rows.length} container(s) on ${clientCount} client(s)`}
                                    </span>
                                </div>
                                {conflicts.length > 0 && (
                                    <div className="flex items-start gap-2 px-4 py-3 text-sm text-error border-t border-border">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                        <span>
                                            {conflicts.length} container(s) already belong to {conflictProjects.join(", ")}.
                                            A container can belong to one project only — narrow the query, for example
                                            with an AND criterion, before saving.
                                        </span>
                                    </div>
                                )}
                                {evaluable.length > 0 && rows.length === 0 && (
                                    <div className="flex items-start gap-2 px-4 py-3 text-sm text-warning border-t border-border">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                        <span>
                                            The query matches nothing at the moment. It can still be saved — containers
                                            that match later join the project by themselves.
                                        </span>
                                    </div>
                                )}
                                <QueryResultTable rows={rows} isEmptyQuery={evaluable.length === 0} />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border">
                    <Button type="button" variant="ghost" onClick={close} disabled={isSaving}>
                        Cancel
                    </Button>
                    <div className="flex items-center gap-3">
                        {error && <p className="text-sm text-error">{error}</p>}
                        <Button
                            type="submit"
                            variant="primary"
                            icon={isNew ? Plus : Save}
                            disabled={isSaving || !canSave}
                            isLoading={isSaving}
                        >
                            {isNew ? "Add Project" : "Save"}
                        </Button>
                    </div>
                </div>
            </Card>
        </form>
    );
};
