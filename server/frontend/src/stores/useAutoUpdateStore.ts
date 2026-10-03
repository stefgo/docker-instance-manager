import { create } from "zustand";
import { AutoUpdateLabelSchema } from "@dim/shared";
import { api } from "../lib/api";

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
        // Started from the socket's handler and from effects, neither of which has a
        // place to show a failure. Logged, so it is not lost entirely.
        try {
            const { labelFilter } = await api.get(
                "/api/v1/settings/container-auto-update/label",
                AutoUpdateLabelSchema,
            );
            set({ labelFilter: parseLabelFilter(labelFilter) });
        } catch (e) {
            console.error("Failed to fetch the auto-update label", e);
        }
    },

    setLabelFilter: (raw) => set({ labelFilter: parseLabelFilter(raw) }),
}));
