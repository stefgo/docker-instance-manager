import type { PullTarget } from "../images/confirmations";
import type { ProjectMembers } from "./hooks/useProjectMembers";

/**
 * How far a project's pull reaches: only what a check found behind, or every container of
 * the project on an image that can be pulled at all, whether it is behind or not.
 */
export type PullMode = "updates" | "force";

/** What one mode of a project's pull would send, and to how many containers. */
export interface PullPlan {
    targets: Required<PullTarget>[];
    containerCount: number;
}

/**
 * The requests a project's pull sends. Always limited to the project's own containers:
 * containers of other projects on the same image are left as they are, forced or not.
 *
 * `updates` goes to the hosts whose own copy is behind -- the reference's status is the
 * worst across hosts, and a host already on the new image has nothing to pull. `force`
 * goes to every host of every reference with a tag; one without cannot be pulled.
 */
export function planPull(live: ProjectMembers, mode: PullMode): PullPlan {
    const targets: Required<PullTarget>[] = [];
    let containerCount = 0;
    for (const t of live.targets) {
        if (t.updateStatus === "none") continue;
        const clientIds = mode === "force"
            ? t.clientIds
            : t.clientIds.filter((id) => t.hostStatus[id] === "update");
        if (clientIds.length === 0) continue;
        const containerIds: Record<string, string[]> = {};
        for (const id of clientIds) {
            containerIds[id] = t.containerIds[id] ?? [];
            containerCount += containerIds[id].length;
        }
        targets.push({ imageRef: t.imageRef, clientIds, containerIds });
    }
    return { targets, containerCount };
}

/** Whether a project has any container a pull could recreate -- which `force` always can. */
export function canPull(live: ProjectMembers): boolean {
    return planPull(live, "force").containerCount > 0;
}
