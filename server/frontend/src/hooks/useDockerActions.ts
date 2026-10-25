import { useCallback } from "react";
import { useToast } from "@stefgo/react-ui-components";
import { SessionExpiredError } from "../lib/apiFetch";
import { useImageMutations } from "../queries/docker";
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
 * A bulk action sends through the `…Async` ones, which report nothing, and hands their
 * requests to `useBatch`: one toast for all of them instead of one per refusal.
 *
 * A remove is asked about first and does not belong here: its dialog stays open and shows
 * the failure itself, so it calls `queries/docker` and lets it throw. A prune calls
 * `queries/docker` too, and hands its requests to `useBatch` once its dialog is answered.
 */
export function useDockerActions() {
    const { show } = useToast();

    const report = useCallback(
        (title: string, e: unknown) => {
            // The session is over and the login form is on screen; that says it already.
            if (e instanceof SessionExpiredError) return;
            // Stays until dismissed: it may name several hosts, and it is the only place
            // the reason is ever shown.
            show({ variant: "error", title, description: getErrorMessage(e), duration: 0 });
        },
        [show],
    );

    /** For a `.catch()`: reports the failure under `title`. */
    const reportFailure = useCallback((title: string) => (e: unknown) => report(title, e), [report]);

    const { checkImageUpdate, updateImage, checkImageUpdateAsync, updateImageAsync } = useImageMutations(report);

    return { checkImageUpdate, updateImage, checkImageUpdateAsync, updateImageAsync, reportFailure };
}
