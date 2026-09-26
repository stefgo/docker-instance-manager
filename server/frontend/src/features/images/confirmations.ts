import type { ConfirmOptions } from "@stefgo/react-ui-components";
import { plural } from "../../utils";

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
 * Title and consequence for a pull. Every list that offers one passes what it would pull,
 * so the dialog names the same references and hosts the button acts on. `recreate` is off
 * only where no container uses the image: the agent then pulls and recreates nothing.
 */
export function describePull(
    targets: PullTarget[],
    recreate = true,
): ConfirmOptions {
    const refs = [...new Set(targets.map((t) => t.imageRef))];
    const hostCount = new Set(targets.flatMap((t) => t.clientIds)).size;
    const hosts = plural(hostCount, "host");
    const subject = refs.length === 1 ? `"${refs[0]}"` : plural(refs.length, "image");
    const action = recreate ? "Pull & recreate" : "Pull";
    const limited = targets.length > 0 && targets.every((t) => t.containerIds);
    const containerCount = new Set(
        targets.flatMap((t) =>
            Object.entries(t.containerIds ?? {}).flatMap(([clientId, ids]) => ids.map((id) => `${clientId}/${id}`)),
        ),
    ).size;
    const recreated = limited
        ? `${containerCount === 1 ? "the container" : `the ${plural(containerCount, "container")}`} shown here ${containerCount === 1 ? "is" : "are"} recreated from it if ${containerCount === 1 ? "it runs" : "they run"} the old one. Other containers on the same image are left as they are.`
        : "every container running the old one is recreated from it.";

    return {
        title: `${action} ${subject}?`,
        description: recreate
            ? `The new image is pulled on ${hosts}, and ${recreated} The containers are unavailable while that happens.`
            : `The new image is pulled on ${hosts}. No container uses it, so nothing is recreated.`,
        confirmLabel: action,
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
 * The Prune button of a host's image list. The host decides what goes: the count is what
 * the list shows as unused, which the host may see differently by the time it prunes.
 */
export function describePruneHost(imageCount: number): ConfirmOptions {
    return {
        title: `Remove ${plural(imageCount, "unused image")}?`,
        description: "Every image on this host that no container uses, not even a stopped one, is deleted, tagged or not. To be used again, an image has to be pulled again.",
        confirmLabel: "Remove images",
        variant: "danger",
    };
}
