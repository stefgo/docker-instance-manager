import { type ReactNode, useCallback, useState } from "react";
import { ConfirmDialog, Radio, RadioGroup } from "@stefgo/react-ui-components";
import { useBatch } from "../../../hooks/useBatch";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { plural } from "../../../utils";
import {
    type PullMode,
    type PullRequest,
    describePull,
    pullReach,
    pullTargets,
} from "../../images/confirmations";
import { type Pull, PullContext } from "./PullContext";

/** The pull a dialog is open for, as it was when the dialog opened. */
interface PendingPull {
    request: PullRequest;
    resolve: (sent: boolean) => void;
}

/**
 * The one dialog every pull & recreate asks in, and what sends it. A request with a forced
 * pull beside it (a project's) lets the dialog choose between the two, each with the number
 * of containers it recreates.
 *
 * The pull's progress shows in the Update column, so the dialog closes right away instead of
 * waiting for it. A row's own pull of one image reports a refusal by itself, as every action
 * of a row does; a pull that reaches more reports in one toast (`useBatch`).
 */
export const PullProvider = ({ children }: { children: ReactNode }) => {
    const { updateImage, updateImageAsync } = useDockerActions();
    const track = useBatch();
    // Kept once the dialog closes, so its text does not empty while it fades out.
    const [pending, setPending] = useState<PendingPull | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<PullMode>("updates");

    const pull: Pull = useCallback(
        (request) =>
            new Promise<boolean>((resolve) => {
                // Opens on what is behind when there is something, and on the forced pull
                // otherwise: an option that would recreate nothing is not the one to start on.
                const opening = request.forced && pullReach(request.targets).count === 0 ? "force" : "updates";
                if (pullTargets(request, opening).length === 0) return resolve(false);
                setMode(opening);
                setPending({ request, resolve });
                setIsOpen(true);
            }),
        [],
    );

    const send = useCallback(
        (request: PullRequest, mode: PullMode) => {
            const targets = pullTargets(request, mode);
            const force = mode === "force";
            if (!request.scope && targets.length === 1) {
                const [t] = targets;
                updateImage(t.imageRef, t.clientIds, t.containerIds, force);
                return;
            }
            void track(
                { action: "pull", noun: "image" },
                targets.map((t) => ({
                    label: t.imageRef,
                    result: updateImageAsync(t.imageRef, t.clientIds, t.containerIds, force),
                })),
            );
        },
        [updateImage, updateImageAsync, track],
    );

    const close = (sent: boolean) => {
        if (!pending || !isOpen) return;
        if (sent) send(pending.request, mode);
        pending.resolve(sent);
        setIsOpen(false);
    };

    const request = pending?.request;
    const options = request ? describePull(request, mode) : null;
    const updates = request ? pullReach(request.targets).count : 0;
    const forced = request?.forced ? pullReach(request.forced).count : 0;

    return (
        <PullContext.Provider value={pull}>
            {children}
            <ConfirmDialog
                isOpen={isOpen}
                onClose={() => close(false)}
                onConfirm={() => close(true)}
                title={options?.title ?? ""}
                description={options?.description}
                confirmLabel={options?.confirmLabel}
            >
                {request?.forced && (
                    <RadioGroup
                        label="Containers"
                        value={mode}
                        onChange={(next) => setMode(next as PullMode)}
                    >
                        <Radio
                            value="updates"
                            disabled={updates === 0}
                            label={`Only with an update (${plural(updates, "container")})`}
                        />
                        <Radio
                            value="force"
                            label={`All containers, forced (${plural(forced, "container")})`}
                        />
                    </RadioGroup>
                )}
            </ConfirmDialog>
        </PullContext.Provider>
    );
};
