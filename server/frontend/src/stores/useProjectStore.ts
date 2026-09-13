import { create } from "zustand";
import { Project, ProjectListResponse, ProjectSummary } from "@dim/shared";
import { apiFetch } from "../lib/apiFetch";
import { getErrorMessage } from "../utils";

interface ProjectStoreState {
    /** The managed projects, as the server last reported them. */
    projects: ProjectSummary[];
    /**
     * Compose project names seen on the hosts that have no DIM entry yet. The server sends
     * them with the list; the add dialog offers them as suggestions.
     */
    discovered: string[];
    setProjects: (payload: ProjectListResponse) => void;
    fetchProjects: () => Promise<void>;
    createProject: (project: { name: string; autoUpdate?: boolean; cron?: string | null }) => Promise<void>;
    updateProject: (name: string, changes: { autoUpdate?: boolean; cron?: string | null }) => Promise<void>;
    deleteProject: (name: string) => Promise<void>;
}

/** Errors are thrown, not swallowed: every caller here has a dialog that shows them. */
async function send(path: string, init: RequestInit): Promise<unknown> {
    const res = await apiFetch(path, {
        headers: { "Content-Type": "application/json" },
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
    createProject: async (project) => {
        await send("/api/v1/projects", {
            method: "POST",
            body: JSON.stringify(project),
        });
    },

    updateProject: async (name, changes) => {
        await send(`/api/v1/projects/${encodeURIComponent(name)}`, {
            method: "PATCH",
            body: JSON.stringify(changes),
        });
    },

    deleteProject: async (name) => {
        await send(`/api/v1/projects/${encodeURIComponent(name)}`, {
            method: "DELETE",
        });
    },
}));

/** Convenience for the routes: the stored project behind a name, if it is managed. */
export function findProject(projects: Project[], name: string | undefined): Project | undefined {
    return name ? projects.find((p) => p.name === name) : undefined;
}
