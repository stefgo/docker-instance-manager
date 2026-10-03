import { getErrorMessage } from "../utils";

/** One host's refusal of an action that went to several. */
export interface HostFailure {
    clientId: string;
    /** The server's own text, such as "Client is not connected". */
    message: string;
}

/**
 * An action that was sent to several hosts and refused by some of them.
 *
 * Its message has one part per host that refused, by the name the lists show the host
 * under, so whatever reports it -- a toast, a dialog that stays open -- says who refused
 * and why without knowing this class. The hosts that carried the action out are kept too:
 * they did, and a caller may have to act on that.
 */
export class HostActionError extends Error {
    readonly failed: HostFailure[];
    readonly succeeded: string[];

    constructor(failed: HostFailure[], succeeded: string[], nameOf: (clientId: string) => string) {
        // Several containers of one host may fail for the same reason; said once.
        const lines = new Set(failed.map((f) => `${nameOf(f.clientId)}: ${f.message}`));
        super([...lines].join("; "));
        this.name = "HostActionError";
        this.failed = failed;
        this.succeeded = succeeded;
    }
}

/**
 * Sends one request per host and waits for all of them.
 *
 * `Promise.all` would stop at the first refusal and leave the rest unreported -- and before
 * that, the requests were not looked at at all: a host that refused to stop a container
 * answered 500 with its reason, and nobody read it. Every host is asked, every answer is
 * kept, and the refusals come back together as one `HostActionError`.
 */
export async function forEachHost<T extends { clientId: string }>(
    targets: readonly T[],
    send: (target: T) => Promise<unknown>,
    nameOf: (clientId: string) => string = (clientId) => clientId,
): Promise<void> {
    const results = await Promise.allSettled(targets.map((target) => send(target)));
    const failed: HostFailure[] = [];
    const succeeded: string[] = [];
    results.forEach((result, i) => {
        const { clientId } = targets[i];
        if (result.status === "fulfilled") succeeded.push(clientId);
        else failed.push({ clientId, message: getErrorMessage(result.reason) });
    });
    if (failed.length > 0) throw new HostActionError(failed, succeeded, nameOf);
}

/**
 * Waits for several multi-host actions -- one per image of a prune, say -- and fails once
 * all of them are through, with every refusal in one message. `Promise.all` would report
 * the first and let the others end unseen.
 */
export async function waitForAll(actions: readonly Promise<unknown>[]): Promise<void> {
    const results = await Promise.allSettled(actions);
    const reasons = new Set(
        results.flatMap((result) => (result.status === "rejected" ? [getErrorMessage(result.reason)] : [])),
    );
    if (reasons.size > 0) throw new Error([...reasons].join("; "));
}
