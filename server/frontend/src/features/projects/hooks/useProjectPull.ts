import { useCallback, useState } from "react";
import { useBatch } from "../../../hooks/useBatch";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { ProjectMembers } from "../lib/projectMembers";
import { PullMode, canPull, planPull } from "../pullPlan";
import { useUpdatingImages } from "../../../queries/docker";

/** The project a pull dialog is open for, as it was when the dialog opened. */
interface PendingPull {
    name: string;
    live: ProjectMembers;
}

export interface ProjectPull {
    pending: PendingPull | null;
    mode: PullMode;
    setMode: (mode: PullMode) => void;
    /** Opens the dialog for a project. */
    request: (name: string, live: ProjectMembers) => void;
    confirm: () => void;
    cancel: () => void;
    canPull: (live: ProjectMembers) => boolean;
    /** Whether a pull of any of the project's references is still running. */
    isUpdating: (live: ProjectMembers) => boolean;
}

/**
 * Pull & recreate for a whole project, behind a dialog that asks how far it goes. The
 * state lives here and `ProjectPullDialog` draws it, so a list keeps one dialog for all of
 * its rows. The pull's progress shows in the Update column and in one toast (`useBatch`), so
 * the dialog closes right away.
 */
export function useProjectPull(): ProjectPull {
    const { updateImageAsync } = useDockerActions();
    const track = useBatch();
    const updatingImages = useUpdatingImages();
    const [pending, setPending] = useState<PendingPull | null>(null);
    const [mode, setMode] = useState<PullMode>("updates");

    // Opens on what is behind when there is something, and on the forced pull otherwise:
    // an option that would recreate nothing is not the one to start on.
    const request = useCallback((name: string, live: ProjectMembers) => {
        setMode(planPull(live, "updates").containerCount > 0 ? "updates" : "force");
        setPending({ name, live });
    }, []);

    const confirm = useCallback(() => {
        if (!pending) return;
        const force = mode === "force";
        void track(
            { action: "pull", noun: "image" },
            planPull(pending.live, mode).targets.map((t) => ({
                label: t.imageRef,
                result: updateImageAsync(t.imageRef, t.clientIds, t.containerIds, force),
            })),
        );
        setPending(null);
    }, [pending, mode, updateImageAsync, track]);

    const cancel = useCallback(() => setPending(null), []);

    const isUpdating = useCallback(
        (live: ProjectMembers) =>
            live.targets.some((t) =>
                t.clientIds.some((id) => !!updatingImages[`${id}::${t.imageRef}`]),
            ),
        [updatingImages],
    );

    return { pending, mode, setMode, request, confirm, cancel, canPull, isUpdating };
}
