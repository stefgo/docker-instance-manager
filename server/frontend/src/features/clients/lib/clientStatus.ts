import { Client, CLIENT_STATUS } from "@dim/shared";
import { toTimestamp } from "../../../utils";

/**
 * Where a client stands in a list sorted by status: the moment it was last heard from. A
 * connected one is heard from right now, so it sorts after every date; one that never
 * connected sorts before all of them.
 *
 * Ascending, the hosts that are gone longest come first -- the ones the column is sorted
 * for.
 */
export const clientStatusOrder = (client: Pick<Client, "status" | "lastSeen">): number =>
    client.status === CLIENT_STATUS.ONLINE
        ? Number.MAX_SAFE_INTEGER
        : (toTimestamp(client.lastSeen) ?? 0);
