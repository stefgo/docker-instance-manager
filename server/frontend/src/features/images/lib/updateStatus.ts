import type { DockerImage, DockerImageUpdateCheck } from "@dim/shared";
import type { BadgeProps } from "@stefgo/react-ui-components";

// Priority: hasUpdate (3) > unchecked (2) > current (1) > not checkable (0)
export type UpdateStatus = "update" | "unchecked" | "current" | "none";

/** How much attention a status asks for; what a column of statuses is sorted by. */
export function updateStatusPriority(status: UpdateStatus): number {
    switch (status) {
        case "update": return 3;
        case "unchecked": return 2;
        case "current": return 1;
        case "none": return 0;
    }
}

/** The status of a row that stands for several: the one that asks for the most attention. */
export function aggregateUpdateStatus(statuses: UpdateStatus[]): UpdateStatus {
    let best: UpdateStatus = "none";
    for (const s of statuses) {
        if (updateStatusPriority(s) > updateStatusPriority(best)) best = s;
    }
    return best;
}

/**
 * What one registry check says about one copy of an image. `canCheck` is the caller's
 * knowledge of whether there is anything to check at all -- an image no container runs, a
 * reference without a tag. A check that failed leaves the image unchecked rather than
 * current. The container groups, the projects and the host's image list all read it here,
 * so the same image cannot carry two statuses.
 */
export function checkStatus(check: DockerImageUpdateCheck | undefined, canCheck: boolean): UpdateStatus {
    if (!canCheck) return "none";
    if (!check || check.error) return "unchecked";
    return check.hasUpdate ? "update" : "current";
}

/**
 * The update status of one image on one host, as the Update column of the image list reads
 * it: only an image in use is checked. The host's image list and the image pages its rows
 * open read it here, so a row and its page cannot disagree.
 */
export function updateStatusOf(image: DockerImage | undefined, inUse: boolean): UpdateStatus {
    return checkStatus(image?.updateCheck, !!image && inUse && image.repoDigests.length > 0);
}

/**
 * What the indicator of a status says in words: its tooltip and its accessible name. The
 * icons differ in colour and in one glyph, which tells nobody what a question mark in a
 * circle stands for. Work under way comes first -- while a pull or a check runs, the status
 * it will replace is not what the row is about.
 */
export function updateStatusLabel(
    status: UpdateStatus,
    { isChecking = false, isUpdating = false }: { isChecking?: boolean; isUpdating?: boolean } = {},
): string {
    if (isUpdating) return "Updating…";
    if (isChecking) return "Checking for updates…";
    switch (status) {
        case "update": return "Update available";
        case "unchecked": return "Not checked yet, or the last check failed";
        case "current": return "Up to date";
        case "none": return "Not checked: nothing here is pulled from a registry and in use";
    }
}

const UPDATE_BADGE: Partial<Record<UpdateStatus, { label: string; variant: NonNullable<BadgeProps["variant"]> }>> = {
    update: { label: "Update available", variant: "warning" },
    current: { label: "Up to date", variant: "success" },
    unchecked: { label: "Not checked", variant: "neutral" },
};

/**
 * The badge a status wears in the header of a page, or `undefined` for `none`: what is not
 * pulled from a registry and in use has nothing to be current with. Every page that names
 * the status reads it here, so a container and its image cannot word it differently.
 */
export function updateStatusBadge(status: UpdateStatus) {
    return UPDATE_BADGE[status];
}
