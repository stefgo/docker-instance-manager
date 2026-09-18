import type { ImageTreeNode } from "../hooks/useImagesData";
import { isCheckingImage } from "./digest";

/**
 * Whether a check runs for a row of the image tree. The Update column and the row's buttons
 * both read it, so the spinner and the disabled button cannot disagree.
 */
export function isNodeChecking(node: ImageTreeNode, checkingImages: Record<string, boolean>): boolean {
    if (node.nodeType === "digest") return !!checkingImages[node.digest];
    if (node.nodeType === "tag") {
        return isCheckingImage(checkingImages, node.repoDigests, `${node.repository}:${node.tag}`);
    }
    return (
        node.children?.some((t) =>
            isCheckingImage(checkingImages, t.repoDigests, `${node.repository}:${t.tag}`),
        ) ?? false
    );
}

/** Whether a pull runs for a row of the image tree, on any of its hosts. */
export function isNodeUpdating(node: ImageTreeNode, imageUpdateStatus: Record<string, boolean>): boolean {
    if (node.nodeType === "tag" || node.nodeType === "digest") {
        return node.clientIds.some((id) => !!imageUpdateStatus[`${id}::${node.repository}:${node.tag}`]);
    }
    return node.children?.some((t) => t.clientIds.some((id) => !!imageUpdateStatus[`${id}::${node.repository}:${t.tag}`])) ?? false;
}
