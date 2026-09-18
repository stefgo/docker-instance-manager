import { useCallback } from "react";
import { useConfirm } from "@stefgo/react-ui-components";
import { useDockerStore } from "../../../stores/useDockerStore";
import { describePull } from "../confirmations";
import type { ImageTreeNode } from "./useImagesData";
import {
    canCheck,
    collectTaggedDigests,
    isNodeChecking,
    isNodeUpdating,
    nodeHasContainers,
} from "../lib/nodeStatus";

/**
 * Check and pull for a row of the image tree, and whether either is under way.
 *
 * The image list and the image page both act through here, so a button in the row and the
 * same entry in the page's menu ask the same questions and send the same requests. The store
 * is read field by field, so a Docker event that touches neither does not re-render the page.
 */
export function useImageNodeActions() {
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const updateImage = useDockerStore((s) => s.updateImage);
    const imageUpdateStatus = useDockerStore((s) => s.imageUpdateStatus);
    const { confirm } = useConfirm();

    const checkUpdate = useCallback((node: ImageTreeNode) => {
        for (const digest of collectTaggedDigests(node)) {
            checkImageUpdate(`${digest.repository}:${digest.tag}`, digest.repoDigests);
        }
    }, [checkImageUpdate]);

    // The pull's progress shows in the Update column, so the dialog closes right away
    // instead of waiting for it.
    const pull = useCallback(async (node: ImageTreeNode) => {
        const targets = collectTaggedDigests(node).map((digest) => ({
            imageRef: `${digest.repository}:${digest.tag}`,
            clientIds: digest.clientIds,
        }));
        if (!(await confirm(describePull(targets, nodeHasContainers(node))))) return;
        for (const t of targets) updateImage(t.imageRef, t.clientIds);
    }, [confirm, updateImage]);

    const isChecking = useCallback(
        (node: ImageTreeNode) => isNodeChecking(node, checkingImages),
        [checkingImages],
    );

    const isUpdating = useCallback(
        (node: ImageTreeNode) => isNodeUpdating(node, imageUpdateStatus),
        [imageUpdateStatus],
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
