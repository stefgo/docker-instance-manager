import { create } from "zustand";
import { Project, ProjectListResponse, ProjectQuery, ProjectSummary } from "@dim/shared";
import { apiFetch } from "../lib/apiFetch";
import { getErrorMessage } from "../utils";

export interface ProjectInput {
    name: string;
    query: ProjectQuery;
    autoUpdate: boolean;
    cron: string | null;
}

interface ProjectStoreState {
    /** The managed projects, as the server last reported them. */
    projects: ProjectSummary[];
    /**
     * Compose project names seen on the hosts whose containers belong to no project yet. The
     * server sends them with the list; the editor offers them as suggestions.
     */
    discovered: string[];
    setProjects: (payload: ProjectListResponse) => void;
    fetchProjects: () => Promise<void>;
    createProject: (project: ProjectInput) => Promise<Project>;
    updateProject: (id: string, changes: Partial<ProjectInput>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
}

/**
 * Errors are thrown, not swallowed: every caller here has a dialog that shows them.
 *
 * The JSON content type is only declared when there is a body. Fastify answers a request
 * that declares JSON but sends nothing -- a DELETE -- with 400.
 */
async function send(path: string, init: RequestInit): Promise<unknown> {
    const res = await apiFetch(path, {
        ...(init.body !== undefined ? { headers: { "Content-Type": "application/json" } } : {}),
        ...init,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Request failed");
    }
    return data;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
    projects: [],
    discovered: [],

    setProjects: ({ projects, discovered }) =>
        set({ projects: projects ?? [], discovered: discovered ?? [] }),

    fetchProjects: async () => {
        try {
            const res = await apiFetch("/api/v1/projects");
            if (!res.ok) return;
            get().setProjects((await res.json()) as ProjectListResponse);
        } catch (e) {
            console.error("Failed to fetch projects", getErrorMessage(e));
        }
    },

    // The three writers below do not touch the store: the server broadcasts PROJECTS_UPDATE
    // after every change, and that is the one path the list is updated through.
    createProject: async (project) =>
        (await send("/api/v1/projects", {
            method: "POST",
            body: JSON.stringify(project),
        })) as Project,

    updateProject: async (id, changes) => {
        await send(`/api/v1/projects/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(changes),
        });
    },

    deleteProject: async (id) => {
        await send(`/api/v1/projects/${encodeURIComponent(id)}`, {
            method: "DELETE",
        });
    },
}));

/** Convenience for the routes: the stored project behind an id, if it is managed. */
export function findProject<P extends Project>(projects: P[], id: string | undefined): P | undefined {
    return id ? projects.find((p) => p.id === id) : undefined;
}
