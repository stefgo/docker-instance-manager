import { create } from "zustand";

export interface ManualAutoUpdateEntry {
  containerName: string;
  clientId?: string;   // undefined or '' = global (all clients)
  addedAt?: string;
}

export interface AutoUpdateLabelFilter {
  key: string;
  value: string | null;
}

export interface ManualIndex {
  global: Set<string>;
  byClient: Record<string, Set<string>>;
}

const EMPTY_INDEX: ManualIndex = { global: new Set(), byClient: {} };

interface AutoUpdateStoreState {
  manualIndex: ManualIndex;
  labelFilter: AutoUpdateLabelFilter | null;
  fetchManualEntries: (token: string) => Promise<void>;
  setManualEntries: (entries: ManualAutoUpdateEntry[]) => void;
  setLabelFilter: (raw: string) => void;
  enrollMany: (entries: ManualAutoUpdateEntry[], token: string) => Promise<void>;
  unenrollMany: (entries: ManualAutoUpdateEntry[], token: string) => Promise<void>;
}

function buildIndex(entries: ManualAutoUpdateEntry[]): ManualIndex {
  const global = new Set<string>();
  const byClient: Record<string, Set<string>> = {};
  for (const e of entries) {
    if (!e.clientId || e.clientId === "") {
      global.add(e.containerName);
    } else {
      if (!byClient[e.clientId]) byClient[e.clientId] = new Set();
      byClient[e.clientId].add(e.containerName);
    }
  }
  return { global, byClient };
}

export function parseLabelFilter(raw: string): AutoUpdateLabelFilter | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) return { key: trimmed, value: null };
  return { key: trimmed.slice(0, eqIdx), value: trimmed.slice(eqIdx + 1) };
}

export const useAutoUpdateStore = create<AutoUpdateStoreState>((set) => ({
  manualIndex: EMPTY_INDEX,
  labelFilter: null,

  fetchManualEntries: async (token) => {
    try {
      const response = await fetch("/api/v1/containers/auto-update/manual", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        entries: ManualAutoUpdateEntry[];
        labelFilter?: string;
      };
      set({
        manualIndex: buildIndex(data.entries ?? []),
        labelFilter: parseLabelFilter(data.labelFilter ?? ""),
      });
    } catch (e) {
      console.error("Failed to fetch manual auto-update entries", e);
    }
  },

  setManualEntries: (entries) => set({ manualIndex: buildIndex(entries) }),

  setLabelFilter: (raw) => set({ labelFilter: parseLabelFilter(raw) }),

  enrollMany: async (entries, token) => {
    if (entries.length === 0) return;
    try {
      await fetch("/api/v1/containers/auto-update/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries }),
      });
    } catch (e) {
      console.error("Failed to enroll containers", e);
    }
  },

  unenrollMany: async (entries, token) => {
    if (entries.length === 0) return;
    try {
      await fetch("/api/v1/containers/auto-update/manual", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries }),
      });
    } catch (e) {
      console.error("Failed to unenroll containers", e);
    }
  },
}));
