import { useCallback, useState } from "react";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ProjectMembers } from "./useProjectMembers";
import { PullMode, canPull, planPull } from "../pullPlan";

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
 * its rows. The pull's progress shows in the Update column, so the dialog closes right away.
 */
export function useProjectPull(): ProjectPull {
    const updateImage = useDockerStore((s) => s.updateImage);
    const updatingImages = useDockerStore((s) => s.updatingImages);
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
        for (const t of planPull(pending.live, mode).targets) {
            updateImage(t.imageRef, t.clientIds, t.containerIds, force);
        }
        setPending(null);
    }, [pending, mode, updateImage]);

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
