import { create } from "zustand";

interface SchedulerStatus {
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

interface ContainerAutoUpdateStatus extends SchedulerStatus {
  cronExpression: string;
}

interface SchedulerStoreState {
  imageUpdateCheck: SchedulerStatus;
  containerAutoUpdate: ContainerAutoUpdateStatus;
  setImageUpdateCheckStatus: (status: SchedulerStatus) => void;
  setContainerAutoUpdateStatus: (status: ContainerAutoUpdateStatus) => void;
}

export const useSchedulerStore = create<SchedulerStoreState>((set) => ({
  imageUpdateCheck: {
    lastRun: null,
    nextRun: null,
    isRunning: false,
  },
  containerAutoUpdate: {
    lastRun: null,
    nextRun: null,
    isRunning: false,
    cronExpression: "",
  },
  setImageUpdateCheckStatus: (status) => set({ imageUpdateCheck: status }),
  setContainerAutoUpdateStatus: (status) =>
    set({ containerAutoUpdate: status }),
}));
