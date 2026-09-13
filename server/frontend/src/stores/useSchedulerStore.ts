import { create } from "zustand";

interface SchedulerStatus {
    lastRun: string | null;
    nextRun: string | null;
    isRunning: boolean;
}

/**
 * The schedulers the server itself runs. Auto-update is not one of them any more: every agent
 * runs its own on its own clock, and what the hosts did stands in the activity, reported by
 * the host that did it, rather than being held here.
 */
interface SchedulerStoreState {
    imageUpdateCheck: SchedulerStatus;
    setImageUpdateCheckStatus: (status: SchedulerStatus) => void;
}

export const useSchedulerStore = create<SchedulerStoreState>((set) => ({
    imageUpdateCheck: {
        lastRun: null,
        nextRun: null,
        isRunning: false,
    },
    setImageUpdateCheckStatus: (status) => set({ imageUpdateCheck: status }),
}));
