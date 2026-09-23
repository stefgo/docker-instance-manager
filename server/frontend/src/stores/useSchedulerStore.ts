import { create } from "zustand";
import type { ImageUpdateCheckSchedulerStatus } from "@dim/shared";

/**
 * The schedulers the server itself runs. Auto-update is not one of them any more: every agent
 * runs its own on its own clock, and what the hosts did stands in the activity, reported by
 * the host that did it, rather than being held here.
 */
interface SchedulerStoreState {
    imageUpdateCheck: ImageUpdateCheckSchedulerStatus;
    setImageUpdateCheckStatus: (status: ImageUpdateCheckSchedulerStatus) => void;
}

export const useSchedulerStore = create<SchedulerStoreState>((set) => ({
    imageUpdateCheck: {
        lastRun: null,
        nextRun: null,
        isRunning: false,
        registries: [],
    },
    // A server that predates the registry list sends none; the table then stays empty.
    setImageUpdateCheckStatus: (status) =>
        set({ imageUpdateCheck: { ...status, registries: status.registries ?? [] } }),
}));
