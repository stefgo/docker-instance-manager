import { useCallback } from "react";
import { useConfirm } from "@stefgo/react-ui-components";
import { useDockerStore } from "../../../stores/useDockerStore";
import { describePull } from "../../images/confirmations";
import { isCheckingImage } from "../../images/lib/digest";
import { describeRemoveContainer } from "../confirmations";
import { getInstances } from "../containerState";
import type { ContainerTreeNode } from "./useContainersData";

/** Whether any instance of the row sits on a connected host, so an action can reach it. */
export const isReachable = (node: ContainerTreeNode): boolean => getInstances(node).length > 0;

export const canStart = (node: ContainerTreeNode): boolean =>
    getInstances(node).some((i) => i.state !== "running" && i.state !== "paused");

export const canStop = (node: ContainerTreeNode): boolean =>
    getInstances(node).some((i) => i.state === "running" || i.state === "paused");

/**
 * What can be done to a container row, and whether it is under way.
 *
 * The container list and the container page both act through here, so the two ask the same
 * questions and send the same actions. Every callback takes a group row or a client row alike.
 * The store is read field by field: the list stays mounted behind a tab of the project page,
 * and a bare `useDockerStore()` would re-render it on every Docker event.
 */
export function useContainerActions() {
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const updateImage = useDockerStore((s) => s.updateImage);
    const imageUpdateStatus = useDockerStore((s) => s.imageUpdateStatus);
    const containerAction = useDockerStore((s) => s.containerAction);
    const { confirm } = useConfirm();

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const isChecking = useCallback((node: ContainerTreeNode) =>
        isCheckingImage(checkingImages, node.repoDigests, node.configImage),
    [checkingImages]);

    const isUpdating = useCallback((node: ContainerTreeNode) =>
        node.clientIds.some((id) => !!imageUpdateStatus[`${id}::${node.configImage}`]),
    [imageUpdateStatus]);

    const checkUpdate = useCallback((node: ContainerTreeNode) => {
        checkImageUpdate(node.configImage, node.repoDigests);
    }, [checkImageUpdate]);

    const checkAll = useCallback((nodes: ContainerTreeNode[]) => {
        for (const node of nodes) checkImageUpdate(node.configImage, node.repoDigests);
    }, [checkImageUpdate]);

    // The pull's progress shows in the Update column, so the dialog closes right away
    // instead of waiting for it.
    const pullAndRecreate = useCallback(async (node: ContainerTreeNode) => {
        // Only the connected hosts: an offline one cannot pull, and would fail the request.
        const instances = getInstances(node);
        if (instances.length === 0) return;
        // The recreate is limited to the row's own containers. Without the list the agent
        // recreates every container on the image, including those of another name.
        const containerIds: Record<string, string[]> = {};
        for (const { clientId, containerId } of instances) {
            (containerIds[clientId] ??= []).push(containerId);
        }
        const target = { imageRef: node.configImage, clientIds: Object.keys(containerIds) };
        if (await confirm(describePull([target]))) updateImage(target.imageRef, target.clientIds, containerIds);
    }, [confirm, updateImage]);

    const start = useCallback((node: ContainerTreeNode) => {
        const targets = getInstances(node).filter((i) => i.state !== "running" && i.state !== "paused");
        return containerAction("container:start", targets);
    }, [containerAction]);

    const stop = useCallback((node: ContainerTreeNode) => {
        const targets = getInstances(node).filter((i) => i.state === "running" || i.state === "paused");
        return containerAction("container:stop", targets);
    }, [containerAction]);

    /** `onRemoved` runs once the action went out -- the page of a removed container leaves. */
    const remove = useCallback((node: ContainerTreeNode, onRemoved?: () => void) => {
        if (!isReachable(node)) return;
        confirm({
            ...describeRemoveContainer(node),
            onConfirm: async () => {
                await containerAction("container:remove", getInstances(node));
                onRemoved?.();
            },
        });
    }, [confirm, containerAction]);

    return {
        isAnyChecking,
        isChecking,
        isUpdating,
        checkUpdate,
        checkAll,
        pullAndRecreate,
        start,
        stop,
        remove,
    };
}
