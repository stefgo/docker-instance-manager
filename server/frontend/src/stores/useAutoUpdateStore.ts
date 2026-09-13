import { create } from "zustand";
import { apiFetch } from "../lib/apiFetch";

export interface AutoUpdateLabelFilter {
    key: string;
    value: string | null;
}

interface AutoUpdateStoreState {
    /**
     * The Docker label that puts a container into auto-update, as the settings configure it.
     * Nothing is enrolled from here any more -- the container lists read it to show which
     * containers carry it, and the server broadcasts it when it changes.
     */
    labelFilter: AutoUpdateLabelFilter | null;
    fetchLabelFilter: () => Promise<void>;
    setLabelFilter: (raw: string) => void;
}

export function parseLabelFilter(raw: string): AutoUpdateLabelFilter | null {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return null;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return { key: trimmed, value: null };
    return { key: trimmed.slice(0, eqIdx), value: trimmed.slice(eqIdx + 1) };
}

export const useAutoUpdateStore = create<AutoUpdateStoreState>((set) => ({
    labelFilter: null,

    fetchLabelFilter: async () => {
        try {
            const response = await apiFetch("/api/v1/settings/container-auto-update/label");
            if (!response.ok) return;
            const data = (await response.json()) as { labelFilter?: string };
            set({ labelFilter: parseLabelFilter(data.labelFilter ?? "") });
        } catch (e) {
            console.error("Failed to fetch the auto-update label", e);
        }
    },

    setLabelFilter: (raw) => set({ labelFilter: parseLabelFilter(raw) }),
}));
