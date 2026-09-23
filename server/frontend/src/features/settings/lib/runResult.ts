import { registryLabel, type SchedulerId, type SchedulerRunSummary } from "@dim/shared";
import { plural } from "../../../utils";

/**
 * What a scheduler's last run did, as the settings page words it. The server stores the
 * numbers; the sentence is written here, like the activity texts.
 */
export function describeRunResult<Id extends SchedulerId>(id: Id, run: SchedulerRunSummary<Id>): string {
    if (run.status === "failed" || run.status === "interrupted") {
        return run.error ?? (run.status === "failed" ? "Failed" : "Interrupted");
    }
    const result = run.result as SchedulerRunSummary["result"];
    if (!result) return "Done";
    switch (id) {
        case "image-update-check": {
            const r = result as SchedulerRunSummary<"image-update-check">["result"] & object;
            const paused = r.pausedRegistries.length > 0
                ? `; paused ${r.pausedRegistries.map(registryLabel).join(", ")}`
                : "";
            return `${r.checked} of ${plural(r.total, "image")} checked${paused}`;
        }
        case "image-cache-cleanup": {
            const r = result as SchedulerRunSummary<"image-cache-cleanup">["result"] & object;
            return `${r.orphansRemoved} orphaned, ${r.expiredRemoved} expired removed`;
        }
        default: {
            const r = result as { removed: number };
            return `${r.removed} removed`;
        }
    }
}
