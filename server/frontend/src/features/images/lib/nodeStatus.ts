import type { DigestNode, ImageTreeNode } from "../hooks/useImagesData";
import { isCheckingImage } from "./digest";

/** Whether a row names at least one pullable `repository:tag` a registry can be asked about. */
export function canCheck(node: ImageTreeNode): boolean {
    return node.repository !== "<none>" &&
        (node.nodeType === "digest" ? node.tag !== "<none>" :
         node.nodeType === "tag" ? node.tag !== "<none>" :
         node.children?.some((t) => t.tag !== "<none>") ?? false);
}

/** Whether a pull of this row would recreate containers, which decides how it is named. */
export function nodeHasContainers(node: ImageTreeNode): boolean {
    if (node.nodeType === "digest") return node.containerIds.length > 0;
    return (node.children ?? []).some(nodeHasContainers);
}

/**
 * The digest nodes below `node` (or `node` itself) that carry a pullable
 * `repository:tag`. Update and check act on these; walking the tree here keeps
 * the callbacks from calling themselves recursively inside their own useCallback,
 * which reads the callback before its declaration has completed.
 */
export function collectTaggedDigests(node: ImageTreeNode): DigestNode[] {
    if (node.nodeType === "digest") {
        return node.repository !== "<none>" && node.tag !== "<none>" ? [node] : [];
    }
    return (node.children ?? []).flatMap(collectTaggedDigests);
}

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
