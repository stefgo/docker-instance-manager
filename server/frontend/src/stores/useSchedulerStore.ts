import { create } from "zustand";

interface SchedulerStatus {
    lastRun: string | null;
    nextRun: string | null;
    isRunning: boolean;
}

/**
 * The schedulers the server itself runs. Auto-update is not one of them any more: every agent
 * runs its own on its own clock, and what the hosts did is read back from their events
 * (`GET /api/v1/settings/container-auto-update/status`) rather than held here.
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
