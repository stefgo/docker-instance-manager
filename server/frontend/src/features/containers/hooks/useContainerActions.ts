import { useCallback } from "react";
import { Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useConfirm } from "@stefgo/react-ui-components";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { containerAction } from "../../../queries/docker";
import { describePull } from "../../images/confirmations";
import { isCheckingImage } from "../../images/lib/digest";
import { describeRemoveContainer } from "../confirmations";
import { getInstances, restartTargets, startTargets, stopTargets } from "../containerState";
import type { ContainerTreeNode } from "../lib/containerGroups";
import { useCheckingImages, useUpdatingImages } from "../../../queries/docker";

/** Whether any instance of the row sits on a connected host, so an action can reach it. */
export const isReachable = (node: ContainerTreeNode): boolean => getInstances(node).length > 0;

export const canStart = (node: ContainerTreeNode): boolean => startTargets(node).length > 0;

export const canStop = (node: ContainerTreeNode): boolean => stopTargets(node).length > 0;

export const canRestart = (node: ContainerTreeNode): boolean => restartTargets(node).length > 0;

/**
 * Start, Stop, Restart and Remove as the entries of a row's menu, for a group row or a client row
 * alike. The list across all hosts and both menus of the container page build theirs here,
 * so an entry is disabled, and says why, the same way wherever it shows up.
 *
 * The handlers are passed in rather than taken from the hook: the page's own menu leaves
 * once its container is removed, which a row's menu does not.
 */
export function containerMenuEntries(
    node: ContainerTreeNode,
    on: {
        start: (node: ContainerTreeNode) => void;
        stop: (node: ContainerTreeNode) => void;
        restart: (node: ContainerTreeNode) => void;
        remove: (node: ContainerTreeNode) => void;
    },
) {
    const reachable = isReachable(node);
    return [
        {
            label: { enabled: "Start", disabled: reachable ? "Already running" : "Client offline" },
            icon: Play,
            onClick: () => on.start(node),
            variant: "default" as const,
            disabled: !canStart(node),
        },
        {
            label: { enabled: "Stop", disabled: reachable ? "Already stopped" : "Client offline" },
            icon: Square,
            onClick: () => on.stop(node),
            variant: "default" as const,
            disabled: !canStop(node),
        },
        {
            label: { enabled: "Restart", disabled: reachable ? "Not running" : "Client offline" },
            icon: RotateCcw,
            onClick: () => on.restart(node),
            variant: "default" as const,
            disabled: !canRestart(node),
        },
        {
            label: { enabled: "Remove", disabled: "Client offline" },
            icon: Trash2,
            onClick: () => on.remove(node),
            variant: "danger" as const,
            disabled: !reachable,
        },
    ];
}

/**
 * What can be done to a container row, and whether it is under way.
 *
 * The container list and the container page both act through here, so the two ask the same
 * questions and send the same actions. Every callback takes a group row or a client row alike.
 * What is under way is read off the pending mutations, not off the Docker state: the list
 * stays mounted behind a tab of the project page and must not re-render on every Docker event.
 */
export function useContainerActions() {
    const { checkImageUpdate, updateImage, reportFailure } = useDockerActions();
    const checkingImages = useCheckingImages();
    const updatingImages = useUpdatingImages();
    const { confirm } = useConfirm();

    // Start, stop and restart go out without a dialog, so a host that refuses has nowhere to say so
    // but a toast. It names the host and gives its reason.
    const send = useCallback(
        (
            action: "container:start" | "container:stop" | "container:restart",
            node: ContainerTreeNode,
            targets: ReturnType<typeof getInstances>,
        ) => {
            const verb = action.slice("container:".length);
            const name = node.nodeType === "container" ? node.name : node.containerName;
            void containerAction(action, targets).catch(reportFailure(`Could not ${verb} ${name}`));
        },
        [reportFailure],
    );

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const isChecking = useCallback((node: ContainerTreeNode) =>
        isCheckingImage(checkingImages, node.repoDigests, node.configImage),
    [checkingImages]);

    const isUpdating = useCallback((node: ContainerTreeNode) =>
        node.clientIds.some((id) => !!updatingImages[`${id}::${node.configImage}`]),
    [updatingImages]);

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
        send("container:start", node, startTargets(node));
    }, [send]);

    const stop = useCallback((node: ContainerTreeNode) => {
        send("container:stop", node, stopTargets(node));
    }, [send]);

    const restart = useCallback((node: ContainerTreeNode) => {
        send("container:restart", node, restartTargets(node));
    }, [send]);

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
    }, [confirm]);

    return {
        isAnyChecking,
        isChecking,
        isUpdating,
        checkUpdate,
        checkAll,
        pullAndRecreate,
        start,
        stop,
        restart,
        remove,
    };
}
