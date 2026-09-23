import { create } from "zustand";
import type { SchedulerStatuses, SchedulerStatusUpdate } from "@dim/shared";

/**
 * The schedulers the server itself runs. Auto-update is not one of them: every agent runs
 * its own on its own clock, and what the hosts did stands in the activity, reported by the
 * host that did it, rather than being held here.
 *
 * Filled by `GET /api/v1/settings/scheduler-status` and kept current by
 * `SCHEDULER_STATUS_UPDATE`, which carries one scheduler at a time.
 */
interface SchedulerStoreState {
    schedulers: Partial<SchedulerStatuses>;
    setSchedulers: (schedulers: Partial<SchedulerStatuses>) => void;
    applyUpdate: (update: SchedulerStatusUpdate) => void;
}

export const useSchedulerStore = create<SchedulerStoreState>((set) => ({
    schedulers: {},
    setSchedulers: (schedulers) => set({ schedulers }),
    applyUpdate: (update) =>
        set((state) => ({ schedulers: { ...state.schedulers, [update.scheduler]: update.status } })),
}));
