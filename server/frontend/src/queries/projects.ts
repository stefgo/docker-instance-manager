import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ProjectListResponseSchema,
    ProjectSchema,
    type Project,
    type ProjectQuery,
    type ProjectSummary,
} from "@dim/shared";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

export interface ProjectInput {
    name: string;
    query: ProjectQuery;
    autoUpdate: boolean;
    cron: string | null;
}

const NO_PROJECTS: ProjectSummary[] = [];

/**
 * The managed projects, with what the current Docker state says about each.
 *
 * Never stale by age: the server broadcasts the whole list as `PROJECTS_UPDATE` after
 * every change. It is not among what a socket sends on connect, so the reconnect reads it
 * again (see `WebSocketProvider`).
 */
export const projectListOptions = queryOptions({
    queryKey: queryKeys.projects.list(),
    queryFn: async (): Promise<ProjectSummary[]> =>
        (await api.get("/api/v1/projects", ProjectListResponseSchema, { fallback: "Could not load the projects" }))
            .projects,
    staleTime: Infinity,
});

/** `isPending` until the list has arrived once; an empty list before that says nothing. */
export function useProjects() {
    const { data = NO_PROJECTS, isPending, error } = useQuery(projectListOptions);
    return { projects: data, isPending, error };
}

/** Convenience for the routes: the stored project behind an id, if it is managed. */
export function findProject<P extends Project>(projects: P[], id: string | undefined): P | undefined {
    return id ? projects.find((p) => p.id === id) : undefined;
}

/**
 * The three writers below read the list again before they resolve. The server broadcasts
 * `PROJECTS_UPDATE` after every change as well, but a page that moves on to the project it
 * has just created must find it in the list, whether or not that message has arrived yet.
 * Errors are thrown, not swallowed: every caller has a dialog or a line that shows them.
 */
function useProjectMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: projectListOptions.queryKey }),
    });
}

export const useCreateProject = () =>
    useProjectMutation((project: ProjectInput) =>
        api.post("/api/v1/projects", project, ProjectSchema, { fallback: "Could not create the project" }),
    );

export const useUpdateProject = () =>
    useProjectMutation(({ id, changes }: { id: string; changes: Partial<ProjectInput> }) =>
        api.patch(`/api/v1/projects/${encodeURIComponent(id)}`, changes, undefined, {
            fallback: "Could not save the project",
        }),
    );

export const useDeleteProject = () =>
    useProjectMutation((id: string) =>
        api.delete(`/api/v1/projects/${encodeURIComponent(id)}`, { fallback: "Could not delete the project" }),
    );
