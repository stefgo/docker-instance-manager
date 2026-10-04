import { formatDate } from "../../../utils";

/**
 * What the page of a client that is not connected says in place of its lists: since when it
 * is gone, how old the Docker state it left behind is, and why nothing can be done to it.
 *
 * The lists themselves stay away. The last state would read as current, and every action on
 * it would go to a host that cannot answer -- but an empty page below a header reads as a
 * broken one, and the two dates were behind the header's details toggle.
 */
export interface OfflineNotice {
    title: string;
    lines: string[];
}

export function offlineNotice(
    { lastSeen, dockerStateAt }: { lastSeen?: string | null; dockerStateAt?: string | null },
    locale?: string,
): OfflineNotice {
    return {
        title: lastSeen
            ? `This client is offline, last seen ${formatDate(lastSeen, { locale })}`
            : "This client has not connected yet",
        lines: [
            dockerStateAt
                ? `Its containers, images, volumes and networks are not listed: the last state it reported is from ${formatDate(dockerStateAt, { locale })} and would read as current.`
                : "It has not reported a Docker state yet.",
            "Actions are possible again once it is connected.",
        ],
    };
}
