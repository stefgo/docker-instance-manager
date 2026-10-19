import type { ConfirmOptions } from "@stefgo/react-ui-components";
import { plural } from "../../utils";
import type { ListScope } from "../../lib/listScope";

/** One reference a pull asks for, and the hosts it asks on. */
export interface PullTarget {
    /** `repository:tag`, what `updateImage` pulls. */
    imageRef: string;
    clientIds: string[];
    /**
     * Per host, the containers the pull is for. Absent, it is for every container on the old
     * image -- which on a project's page would include containers of other projects.
     */
    containerIds?: Record<string, string[]>;
}

/**
 * How far a pull goes: only to what a check found behind, or to every container it names,
 * whether that runs the new image already or not.
 */
export type PullMode = "updates" | "force";

/**
 * One pull & recreate, as `usePull` asks about it and sends it. Every button that pulls
 * describes its pull this way and nothing else, so the dialog names the same references,
 * hosts and containers the button acts on.
 */
export interface PullRequest {
    /** What a check found behind: what the pull sends. */
    targets: PullTarget[];
    /**
     * What a forced pull sends. Given, the dialog offers the choice between the two. It names
     * its containers, or a forced pull would recreate every container on the image.
     */
    forced?: Required<PullTarget>[];
    /** The part of a list a button in its header reaches. Absent on a row's own button. */
    scope?: ListScope;
    /** How many rows are picked, with `scope` "selected"; the dialog sets the reach against it. */
    selected?: number;
    /** Off only where no container uses the image: the agent then pulls and recreates nothing. */
    recreate?: boolean;
    /** What the pull is for where that is not its images: a project's name. */
    subject?: string;
}

/** The targets one mode of a request sends. */
export const pullTargets = (request: PullRequest, mode: PullMode): PullTarget[] =>
    mode === "force" ? request.forced ?? [] : request.targets;

/**
 * What a pull reaches, counted as the dialog counts it: the containers where every target
 * names its own, the references otherwise -- a pull without the list recreates whatever runs
 * the image, which no count of rows could say.
 */
export function pullReach(targets: readonly PullTarget[]): { count: number; noun: "container" | "image" } {
    const limited = targets.length > 0 && targets.every((t) => t.containerIds);
    if (!limited) return { count: new Set(targets.map((t) => t.imageRef)).size, noun: "image" };
    const containers = new Set(
        targets.flatMap((t) =>
            Object.entries(t.containerIds ?? {}).flatMap(([clientId, ids]) => ids.map((id) => `${clientId}/${id}`)),
        ),
    );
    return { count: containers.size, noun: "container" };
}

/**
 * Which part of a list a header's pull reaches: the picked rows, the ones a search or a
 * filter leaves, or every row -- so a filter left on or a pick left over is never pulled for
 * unseen. Without `force` only the rows with an update are pulled for, which it says.
 */
function describePullScope(
    scope: ListScope,
    { count, noun }: ReturnType<typeof pullReach>,
    selected: number,
    mode: PullMode,
): string {
    const is = count === 1 ? "is" : "are";
    const nouns = count === 1 ? noun : `${noun}s`;
    if (scope === "selected") {
        return count < selected
            ? `${count} of the ${plural(selected, `selected ${noun}`)} ${is} reached; the others have nothing to pull.`
            : `The selected ${nouns} ${is} reached.`;
    }
    const behind = mode === "force" ? "" : count === 1 ? " that has an update" : " that have an update";
    return scope === "shown"
        ? `Only the ${nouns} the list shows${behind} ${is} reached: a search or a filter narrows it.`
        : `Every ${noun} in the list${mode === "force" ? "" : " that has an update"} is reached.`;
}

/**
 * Title and consequence of a pull, in one of its modes. A header's button says which part of
 * the list it reaches (`scope`); a row's own needs no such sentence.
 */
export function describePull(request: PullRequest, mode: PullMode = "updates"): ConfirmOptions {
    const { recreate = true, scope, subject } = request;
    const targets = pullTargets(request, mode);
    const reach = pullReach(targets);
    const { count, noun } = reach;
    const refs = [...new Set(targets.map((t) => t.imageRef))];
    const one = refs.length === 1;
    const hosts = plural(new Set(targets.flatMap((t) => t.clientIds)).size, "host");
    const action = recreate ? "Pull & recreate" : "Pull";
    const what = subject !== undefined
        ? `${plural(count, noun)} of "${subject}"`
        : one ? `"${refs[0]}"` : plural(refs.length, "image");

    const pulled = `The new ${one ? "image is" : "images are"} pulled on ${hosts}`;
    const theyRun = count === 1 ? "it runs" : "they run";
    const recreated = noun === "container"
        ? `${count === 1 ? "the container" : `the ${plural(count, "container")}`} ${count === 1 ? "is" : "are"} recreated from ${one ? "it" : "them"}${
            mode === "force" ? `, whether ${theyRun} the new one already or not.` : ` if ${theyRun} the old one.`
        } Other containers on the same image are left as they are.`
        : `every container running the old one is recreated from ${one ? "it" : "the new one"}.`;
    const consequence = recreate
        ? `${pulled}, and ${recreated} The containers are unavailable while that happens.`
        : `${pulled}. No container uses ${one ? "it" : "them"}, so nothing is recreated.`;

    return {
        title: `${action} ${what}?`,
        description: scope
            ? `${describePullScope(scope, reach, request.selected ?? count, mode)} ${consequence}`
            : consequence,
        // Where the mode changes how many are reached, the button says it.
        confirmLabel: request.forced ? `${action} ${plural(count, noun)}` : action,
    };
}

/** The Prune button of the image list: the images it shows that no container uses. */
export function describePruneAll(imageCount: number): ConfirmOptions {
    return {
        title: `Remove ${plural(imageCount, "unused image")}?`,
        description: "The images the list shows, with its search applied, that no container uses are deleted from the hosts that have them, tagged or not. To be used again, an image has to be pulled again.",
        confirmLabel: "Remove images",
        variant: "danger",
    };
}

/** The Prune button of the image list while rows are picked: those of them no container uses. */
export function describePruneSelection(imageCount: number): ConfirmOptions {
    return {
        title: `Remove ${plural(imageCount, "unused image")}?`,
        description: "The selected images that no container uses are deleted from the hosts that have them, tagged or not. The other selected images stay. To be used again, an image has to be pulled again.",
        confirmLabel: "Remove images",
        variant: "danger",
    };
}

/** What a header's check reaches: how many rows, named how, and of which part of the list. */
export interface CheckReach {
    count: number;
    /** What a row is, in the singular: "container", "image", "project". */
    noun: string;
    scope: ListScope;
    /** How many rows are picked, with `scope` "selected"; the dialog sets `count` against it. */
    selected?: number;
}

/**
 * The check in a list's header. It asks first, as a prune does, and names how many rows it
 * reaches and which: every row, the ones a search or a filter leaves, or the picked ones --
 * so a filter left on or a pick left over is never acted on unseen. The count is what the
 * check reaches, which can be fewer than the picked rows: an image no container runs is
 * not asked about.
 */
export function describeCheck({ count, noun, scope, selected = count }: CheckReach): ConfirmOptions {
    const nouns = count === 1 ? noun : `${noun}s`;
    const is = count === 1 ? "is" : "are";
    const which =
        scope === "selected"
            ? count < selected
                ? `${count} of the ${plural(selected, `selected ${noun}`)} ${is} checked; the others have no image a registry can be asked about.`
                : `The selected ${nouns} ${is} checked.`
            : scope === "shown"
                ? `Only the ${nouns} the list shows ${is} checked: a search or a filter narrows it.`
                : `Every ${noun} in the list is checked.`;
    return {
        title: `Check ${plural(count, noun)} for updates?`,
        description: `${which} The registries are asked whether a newer image exists; nothing is pulled or recreated.`,
        confirmLabel: "Check for updates",
    };
}

/** The trash icon on a repository, tag or digest row. `label` is how the row names itself. */
export function describePruneNode(label: string, imageCount: number): ConfirmOptions {
    return {
        title: `Prune unused images of "${label}"?`,
        description: `${plural(imageCount, "image")} below this entry that no container uses ${imageCount === 1 ? "is" : "are"} deleted from all hosts that have ${imageCount === 1 ? "it" : "them"}. To be used again, an image has to be pulled again.`,
        confirmLabel: "Remove images",
        variant: "danger",
    };
}

/** The Prune button of one image's page: its images no container uses. */
export function describePruneUnused(imageCount: number): ConfirmOptions {
    return {
        title: `Remove ${plural(imageCount, "unused image")}?`,
        description: "The images listed here that no container uses are deleted from the hosts that have them. To be used again, an image has to be pulled again.",
        confirmLabel: "Remove images",
        variant: "danger",
    };
}

/**
 * The Prune button of a host's image list. Without a search the host decides what goes: the
 * count is what the list shows as unused, which the host may see differently by the time it
 * prunes. With one, only the images the search leaves are removed, one by one.
 */
export function describePruneHost(imageCount: number, scope: ListScope = "all"): ConfirmOptions {
    const which =
        scope === "shown"
            ? "Only the images the list shows, with its search applied, that no container uses, not even a stopped one, are deleted from this host, with every tag they have. The others stay."
            : "Every image on this host that no container uses, not even a stopped one, is deleted, tagged or not.";
    return {
        title: `Remove ${plural(imageCount, "unused image")}?`,
        description: `${which} To be used again, an image has to be pulled again.`,
        confirmLabel: "Remove images",
        variant: "danger",
    };
}
