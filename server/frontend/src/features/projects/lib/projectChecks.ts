import type { ImageCheckTarget } from "../../../lib/cacheUpdates";
import type { ProjectImageTarget } from "./projectMembers";

/** A project row as far as its check is concerned: the images it is updated by. */
interface CheckableRow {
    id: string;
    live: { targets: readonly Pick<ProjectImageTarget, "imageRef" | "repoDigests" | "updateStatus">[] };
}

/** Whether a project has an image a registry can be asked about. */
export const isCheckable = (row: CheckableRow): boolean =>
    row.live.targets.some((target) => target.updateStatus !== "none");

/**
 * What a check of these projects asks about, and how many of them it reaches. Keyed by
 * reference rather than by project: two projects that run the same image ask the registry
 * one question.
 */
export function planCheck(rows: readonly CheckableRow[]): { count: number; checks: ImageCheckTarget[] } {
    const byRef = new Map<string, Set<string>>();
    let count = 0;
    for (const row of rows) {
        if (!isCheckable(row)) continue;
        count++;
        for (const target of row.live.targets) {
            if (target.updateStatus === "none") continue;
            let digests = byRef.get(target.imageRef);
            if (!digests) byRef.set(target.imageRef, (digests = new Set()));
            for (const digest of target.repoDigests) digests.add(digest);
        }
    }
    const checks = Array.from(byRef, ([imageRef, digests]) => ({ imageRef, repoDigests: [...digests] }));
    return { count, checks };
}

/**
 * The picked projects the list still shows. What the search takes off the list leaves the
 * selection as well: nothing is acted on behind the reader's back.
 */
export const shownSelection = (rows: readonly { id: string }[], picked: ReadonlySet<string | number>): Set<string> =>
    new Set(rows.map((row) => row.id).filter((id) => picked.has(id)));
