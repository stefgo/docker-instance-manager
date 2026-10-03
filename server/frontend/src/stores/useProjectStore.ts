import { create } from "zustand";
import {
    Project,
    ProjectListResponse,
    ProjectListResponseSchema,
    ProjectQuery,
    ProjectSchema,
    ProjectSummary,
} from "@dim/shared";
import { api } from "../lib/api";

export interface ProjectInput {
    name: string;
    query: ProjectQuery;
    autoUpdate: boolean;
    cron: string | null;
}

interface ProjectStoreState {
    /** The managed projects, as the server last reported them. */
    projects: ProjectSummary[];
    setProjects: (payload: ProjectListResponse) => void;
    fetchProjects: () => Promise<void>;
    createProject: (project: ProjectInput) => Promise<Project>;
    updateProject: (id: string, changes: Partial<ProjectInput>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
    projects: [],

    setProjects: ({ projects }) => set({ projects: projects ?? [] }),

    fetchProjects: async () => {
        // Started from the socket's handler and from effects, neither of which has a
        // place to show a failure. Logged, so it is not lost entirely.
        try {
            get().setProjects(await api.get("/api/v1/projects", ProjectListResponseSchema));
        } catch (e) {
            console.error("Failed to fetch projects", e);
        }
    },

    // The three writers below do not touch the store: the server broadcasts PROJECTS_UPDATE
    // after every change, and that is the one path the list is updated through. Errors are
    // thrown, not swallowed: every caller here has a dialog that shows them.
    createProject: (project) =>
        api.post("/api/v1/projects", project, ProjectSchema, { fallback: "Request failed" }),

    updateProject: (id, changes) =>
        api.patch(`/api/v1/projects/${encodeURIComponent(id)}`, changes, undefined, {
            fallback: "Request failed",
        }),

    deleteProject: (id) =>
        api.delete(`/api/v1/projects/${encodeURIComponent(id)}`, { fallback: "Request failed" }),
}));

/** Convenience for the routes: the stored project behind an id, if it is managed. */
export function findProject<P extends Project>(projects: P[], id: string | undefined): P | undefined {
    return id ? projects.find((p) => p.id === id) : undefined;
}
