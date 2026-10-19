import type { ListScope } from "../../lib/listScope";
import type { PullMode, PullRequest, PullTarget } from "../images/confirmations";
import { type ProjectMembers, containerKey } from "./lib/projectMembers";

/** What one mode of a project's pull would send, and to how many containers. */
export interface PullPlan {
    targets: Required<PullTarget>[];
    containerCount: number;
}

/**
 * The requests a project's pull sends. Always limited to the project's own containers:
 * containers of other projects on the same image are left as they are, forced or not.
 * `containerKeys` (`containerKey`) narrows it further, to the containers a list shows or
 * has picked; a host left with none of them is not asked.
 *
 * `updates` goes to the hosts whose own copy is behind -- the reference's status is the
 * worst across hosts, and a host already on the new image has nothing to pull. `force`
 * goes to every host of every reference with a tag; one without cannot be pulled.
 */
export function planPull(live: ProjectMembers, mode: PullMode, containerKeys?: ReadonlySet<string>): PullPlan {
    const targets: Required<PullTarget>[] = [];
    let containerCount = 0;
    for (const t of live.targets) {
        if (t.updateStatus === "none") continue;
        const containerIds: Record<string, string[]> = {};
        for (const id of t.clientIds) {
            if (mode === "updates" && t.hostStatus[id] !== "update") continue;
            const ids = (t.containerIds[id] ?? []).filter(
                (containerId) => !containerKeys || containerKeys.has(containerKey(id, containerId)),
            );
            // A host with none of the containers asked for stays out -- unless nothing narrows
            // the pull, where its empty list keeps it from recreating containers of others.
            if (containerKeys && ids.length === 0) continue;
            containerIds[id] = ids;
            containerCount += ids.length;
        }
        const clientIds = Object.keys(containerIds);
        if (clientIds.length === 0) continue;
        targets.push({ imageRef: t.imageRef, clientIds, containerIds });
    }
    return { targets, containerCount };
}

/** Whether a project has any container a pull could recreate -- which `force` always can. */
export function canPull(live: ProjectMembers, containerKeys?: ReadonlySet<string>): boolean {
    return planPull(live, "force", containerKeys).containerCount > 0;
}

/** What a project's pull reaches, with the part of a list that reaches it. */
export interface ProjectPullReach {
    /** Absent on a project's own row, which reaches the whole project. */
    scope?: ListScope;
    /** The containers a list shows or has picked; absent for every container of the project. */
    containerKeys?: ReadonlySet<string>;
    /** How many rows are picked, with `scope` "selected". */
    selected?: number;
}

/**
 * A project's pull as `usePull` asks about it: what a check found behind, with the forced
 * pull of every container as the other choice of its dialog.
 */
export function projectPullRequest(name: string, live: ProjectMembers, reach: ProjectPullReach = {}): PullRequest {
    return {
        targets: planPull(live, "updates", reach.containerKeys).targets,
        forced: planPull(live, "force", reach.containerKeys).targets,
        scope: reach.scope,
        selected: reach.selected,
        subject: name,
    };
}

/** Whether a pull of any of the project's references is still running, by `useUpdatingImages`. */
export function isPulling(live: ProjectMembers, updatingImages: Record<string, boolean>): boolean {
    return live.targets.some((t) => t.clientIds.some((id) => !!updatingImages[`${id}::${t.imageRef}`]));
}
