import { create } from "zustand";
import { DockerState } from "@dim/shared";

interface DockerStoreState {
    /** Map of clientId → DockerState */
    dockerStates: Record<string, DockerState>;

    setDockerState: (clientId: string, state: DockerState) => void;
    getDockerState: (clientId: string) => DockerState | null;

    /** Fetch initial Docker state for a client via REST */
    fetchDockerState: (clientId: string, token: string) => Promise<void>;
}

export const useDockerStore = create<DockerStoreState>((set, get) => ({
    dockerStates: {},

    setDockerState: (clientId, state) =>
        set((s) => ({ dockerStates: { ...s.dockerStates, [clientId]: state } })),

    getDockerState: (clientId) => get().dockerStates[clientId] ?? null,

    fetchDockerState: async (clientId, token) => {
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/docker`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const state: DockerState = await res.json();
            set((s) => ({ dockerStates: { ...s.dockerStates, [clientId]: state } }));
        } catch {
            // silently ignore – state will arrive via WebSocket
        }
    },
}));
