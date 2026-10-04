import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Save, X } from "lucide-react";
import {
    CLIENT_STATUS,
    CreateProjectSchema,
    Project,
    ProjectQuery,
    containerNameOf,
    findQueryConflicts,
    matchCriterion,
    matchQuery,
} from "@dim/shared";
import { ActionButton, Button, Card, Input, LoadingIndicator } from "@stefgo/react-ui-components";
import { useHostStates } from "../hooks/useProjectMembers";
import { collectSuggestions, completeCriteria, newCriterion } from "../query";
import { clientName, plural } from "../../../utils";
import { NotFoundError } from "../../../lib/notFound";
import { QueryBuilder } from "./QueryBuilder";
import { QueryResultRow, QueryResultTable } from "./QueryResultTable";
import { useClients } from "../../../queries/clients";
import { findProject, useCreateProject, useProjects, useUpdateProject } from "../../../queries/projects";
import { useEntityForm } from "../../../hooks/useEntityForm";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";
import { HeaderBreadcrumb } from "../../app/HeaderBreadcrumb";
import type { FieldErrors } from "../../../lib/entityForm";
import { paths } from "../../../lib/paths";

interface ProjectEditorProps {
    /** The project to edit; without one, a new project is created. */
    projectId?: string;
}

/** The part of a project this editor changes, checked the way both requests parse it. */
const ProjectDraftSchema = CreateProjectSchema.pick({ name: true, query: true });

interface ProjectDraft {
    name: string;
    /** As edited: a row may still be without a value. Only complete rows are sent. */
    query: ProjectQuery;
}

const draftFrom = (project: Project | undefined): ProjectDraft => ({
    name: project?.name ?? "",
    query: project && project.query.length > 0 ? project.query : [newCriterion()],
});

/** The draft as both requests carry it: the name trimmed, the rows without a value left out. */
const toInput = (draft: ProjectDraft): { name: string; query: ProjectQuery } => ({
    name: draft.name.trim(),
    query: completeCriteria(draft.query),
});

/** A row without a value keeps Save off; the schema would never see it, since it is not sent. */
const projectRules = (draft: ProjectDraft): FieldErrors<ProjectDraft> =>
    draft.query.some((c) => !c.value.trim()) ? { query: "Every criterion needs a value" } : {};

/**
 * `/projects/new` and `/projects/:projectId/edit`. The project is read from the list, and
 * the form below starts only once it is there: a form opens with the draft it is given.
 */
export const ProjectEditor = ({ projectId }: ProjectEditorProps) => {
    // Before the list has arrived, an id that is not in it says nothing.
    const { projects, isPending } = useProjects();
    const project = findProject(projects, projectId);

    if (projectId !== undefined && !project) {
        if (isPending) return <LoadingIndicator label="Loading project…" />;
        throw new NotFoundError("project");
    }
    // Keyed, so pointing the route at another project starts the form over.
    return <ProjectForm key={project?.id ?? "new"} project={project} />;
};

/**
 * Creates or edits a project: its name and the query that decides which containers belong
 * to it. Auto-update is set on the project's overview, not here. The query is evaluated live
 * against the fleet while it is written, so the result table below always shows what saving
 * would mean -- including the containers another project already has, which a save refuses.
 *
 * Leaving asks first when there are unsaved edits, whichever way out is taken
 * (`useUnsavedChangesGuard`); it used to leave without a question.
 */
const ProjectForm = ({ project }: { project: Project | undefined }) => {
    const isNew = project === undefined;
    const projectId = project?.id;

    const { projects } = useProjects();
    const { mutateAsync: createProject } = useCreateProject();
    const { mutateAsync: updateProject } = useUpdateProject();
    const clients = useClients().clients;
    const hostStates = useHostStates();

    const form = useEntityForm({
        schema: ProjectDraftSchema,
        initial: () => draftFrom(project),
        toInput,
        rules: projectRules,
    });
    const { draft, set, errors, isSaving } = form;
    const { query } = draft;
    // The parent in the route tree: the list for a new project, the project's page for an
    // existing one.
    const { close, leave } = useUnsavedChangesGuard(form.isDirty, "project");

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
                    clientName: client ? clientName(client) : s.clientId,
                    clientOnline: client?.status === CLIENT_STATUS.ONLINE,
                    containerName: containerNameOf(container),
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

    // What only the fleet and the other projects know. Not among the form's rules: both are
    // computed from the draft the form hands out, so they are added to its verdict here.
    const nameTaken = otherProjects.some((p) => p.name === draft.name.trim() && p.id !== projectId);
    const canSave = form.canSave && !nameTaken && conflicts.length === 0;

    // Beside the button: why the save was refused, or what keeps it off and has no field.
    const error = form.saveError ?? form.formError ?? (conflicts.length === 0 ? errors.query : undefined);

    const save = async () => {
        if (!canSave) return;
        setSavingFrom(new Set(projects.map((p) => p.id)));
        let created: Project | undefined;
        // A refusal stays on the page, beside the button that retries it. A conflict the
        // live check did not see (a container that appeared meanwhile) arrives there too.
        // What is sent is the draft as `toInput` builds it; the form has checked exactly that.
        const input = toInput(draft);
        const stored = await form.submit(async () => {
            if (isNew) {
                // A new project starts with auto-update off; an existing one keeps its settings.
                created = await createProject({ ...input, autoUpdate: false, cron: null });
            } else {
                await updateProject({ id: project.id, changes: input });
            }
        });
        if (!stored) {
            setSavingFrom(null);
        } else if (created) {
            leave(paths.project(created.id), { replace: true });
        } else {
            leave();
        }
    };

    const heading = isNew ? "Add Project" : "Edit Project Query";

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
                title={<HeaderBreadcrumb current={heading}>{heading}</HeaderBreadcrumb>}
                action={<ActionButton icon={X} tooltip="Close" onClick={close} disabled={isSaving} />}
                classNames={{ header: "py-6 px-7" }}
            >
                <div className="px-6 py-4 space-y-6">
                    <p className="text-sm text-text-muted">
                        A project groups containers across all hosts. Which containers belong to it is
                        decided by the query below and resolved live from what the hosts report. A
                        container can belong to one project only.
                    </p>

                    <Input
                        label="Project Name"
                        value={draft.name}
                        onChange={(e) => set("name", e.target.value)}
                        placeholder="nextcloud"
                        error={nameTaken ? "A project of that name already exists" : errors.name}
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
                                    Select containers by their client, their name or their image. Join criteria with AND or OR — they are applied from top to bottom.
                                </span>

                                <QueryBuilder
                                    query={query}
                                    onChange={(next) => set("query", next)}
                                    suggestions={suggestions}
                                    hitCounts={hitCounts}
                                />
                            </div>

                            <div className="border-t border-border">
                                <div className="flex items-center gap-2 px-4 py-2 bg-card-header">
                                    <span className="text-xs font-bold text-text-muted uppercase">
                                        {evaluable.length === 0
                                            ? "Result · waiting for a complete criterion"
                                            : `Result · ${plural(rows.length, "container")} on ${plural(clientCount, "client")}`}
                                    </span>
                                </div>
                                {conflicts.length > 0 && (
                                    <div className="flex items-start gap-2 px-4 py-3 text-sm text-error border-t border-border">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                        <span>
                                            {plural(conflicts.length, "container")} already {conflicts.length === 1 ? "belongs" : "belong"} to {conflictProjects.join(", ")}.
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
                            disabled={!canSave}
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
