import type { ConfirmOptions } from "@stefgo/react-ui-components";
import { plural } from "../../utils";

/** One reference a pull asks for, and the hosts it asks on. */
export interface PullTarget {
    /** `repository:tag`, what `updateImage` pulls. */
    imageRef: string;
    clientIds: string[];
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

    return {
        title: `${action} ${subject}?`,
        description: recreate
            ? `The new image is pulled on ${hosts}, and every container running the old one is recreated from it. The containers are unavailable while that happens.`
            : `The new image is pulled on ${hosts}. No container uses it, so nothing is recreated.`,
        confirmLabel: action,
    };
}

/** The Prune button of the image list: every tag no container uses, on every host. */
export function describePruneAll(tagCount: number): ConfirmOptions {
    return {
        title: `Remove ${plural(tagCount, "unused image tag")}?`,
        description: "Every image tag that no container uses is deleted from all hosts that have it. To be used again, an image has to be pulled again.",
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
