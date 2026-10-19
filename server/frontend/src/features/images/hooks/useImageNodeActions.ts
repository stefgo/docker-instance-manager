import { useCallback } from "react";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { usePull } from "../../app/context/PullContext";
import type { ImageTreeNode } from "../lib/imageTree";
import {
    canCheck,
    collectCheckableDigests,
    collectTaggedDigests,
    isNodeChecking,
    isNodeUpdating,
    nodeHasContainers,
} from "../lib/nodeStatus";
import { useCheckingImages, useUpdatingImages } from "../../../queries/docker";

/**
 * Check and pull for a row of the image tree, and whether either is under way.
 *
 * The image list and the image page both act through here, so a button in the row and the
 * same entry in the page's menu ask the same questions and send the same requests. The store
 * is read field by field, so a Docker event that touches neither does not re-render the page.
 */
export function useImageNodeActions() {
    const { checkImageUpdate } = useDockerActions();
    const pullImages = usePull();
    const checkingImages = useCheckingImages();
    const updatingImages = useUpdatingImages();

    // One request per tag and digest: the server answers it for every platform at once, so
    // the rows the same digest has on several platforms share it.
    const checkUpdate = useCallback((node: ImageTreeNode) => {
        const asked = new Set<string>();
        for (const digest of collectCheckableDigests(node)) {
            const imageRef = `${digest.repository}:${digest.tag}`;
            const key = `${imageRef}@${digest.digest}`;
            if (asked.has(key)) continue;
            asked.add(key);
            checkImageUpdate(imageRef, digest.repoDigests);
        }
    }, [checkImageUpdate]);

    const pull = useCallback(async (node: ImageTreeNode) => {
        // Only the rows with an update: on a tag, the platforms that are current stay as they are.
        const targets = collectTaggedDigests(node)
            .filter((digest) => digest.updateStatus === "update")
            .map((digest) => ({
                imageRef: `${digest.repository}:${digest.tag}`,
                clientIds: digest.clientIds,
            }));
        await pullImages({ targets, recreate: nodeHasContainers(node) });
    }, [pullImages]);

    const isChecking = useCallback(
        (node: ImageTreeNode) => isNodeChecking(node, checkingImages),
        [checkingImages],
    );

    const isUpdating = useCallback(
        (node: ImageTreeNode) => isNodeUpdating(node, updatingImages),
        [updatingImages],
    );

    return {
        checkUpdate,
        pull,
        isChecking,
        isUpdating,
        isAnyChecking: Object.values(checkingImages).some(Boolean),
        /** Offered at all: the row names something a registry can be asked about. */
        canCheck,
        /** Whether the pull recreates containers, and so how the action is named. */
        pullLabel: (node: ImageTreeNode) => (nodeHasContainers(node) ? "Pull & Recreate" : "Pull"),
        /** Offered: a check found an update. */
        canPull: (node: ImageTreeNode) => node.updateStatus === "update",
    };
}
