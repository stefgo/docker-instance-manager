import { useCallback } from "react";
import { useToast } from "@stefgo/react-ui-components";
import { SessionExpiredError } from "../lib/apiFetch";
import { useDockerStore } from "../stores/useDockerStore";
import { getErrorMessage } from "../utils";

/**
 * The Docker actions a page sends and does not wait for: a check, a pull, a start, a stop.
 *
 * Their progress shows in the row -- a spinner in the Update column -- and their result
 * arrives as a new Docker state, so nothing holds a dialog open for them. That used to mean
 * nothing looked at the answer either: a host that refused was indistinguishable from one
 * that took its time. Sent through here, a refusal becomes a toast that names the host and
 * gives the server's reason.
 *
 * An action that is asked about first -- a remove, a prune -- does not belong here: its
 * dialog stays open and shows the failure itself, so it calls the store and lets it throw.
 */
export function useDockerActions() {
    const { show } = useToast();
    const check = useDockerStore((s) => s.checkImageUpdate);
    const update = useDockerStore((s) => s.updateImage);

    /** For a `.catch()`: reports the failure under `title`. */
    const reportFailure = useCallback(
        (title: string) => (e: unknown) => {
            // The session is over and the login form is on screen; that says it already.
            if (e instanceof SessionExpiredError) return;
            // Stays until dismissed: it may name several hosts, and it is the only place
            // the reason is ever shown.
            show({ variant: "error", title, description: getErrorMessage(e), duration: 0 });
        },
        [show],
    );

    const checkImageUpdate = useCallback(
        (imageRef: string, repoDigests: string[]) => {
            void check(imageRef, repoDigests).catch(reportFailure(`Could not check ${imageRef}`));
        },
        [check, reportFailure],
    );

    const updateImage = useCallback(
        (imageRef: string, clientIds: string[], containerIds?: Record<string, string[]>, force?: boolean) => {
            void update(imageRef, clientIds, containerIds, force).catch(
                reportFailure(`Could not update ${imageRef}`),
            );
        },
        [update, reportFailure],
    );

    return { checkImageUpdate, updateImage, reportFailure };
}
