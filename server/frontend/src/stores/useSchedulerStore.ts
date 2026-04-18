import { create } from "zustand";

interface SchedulerStatus {
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

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
  setImageUpdateCheckStatus: (status) =>
    set({ imageUpdateCheck: status }),
}));
