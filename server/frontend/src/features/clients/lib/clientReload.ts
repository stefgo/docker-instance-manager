import { Client, CLIENT_STATUS, CONNECTION_MODE } from "@dim/shared";

export type ReloadStep = "reconnect" | "refresh";

/**
 * What a reload does to a client. It means two different things depending on which side
 * dials: an offline outbound client needs a connection attempt before there is anything to
 * read, a connected one just needs its Docker state fetched again.
 *
 * An offline inbound client gets neither: its agent dials, so the server can only wait.
 */
export const reloadStep = (client: Pick<Client, "status" | "connectionMode">): ReloadStep | null => {
    if (client.status === CLIENT_STATUS.ONLINE) return "refresh";
    return client.connectionMode === CONNECTION_MODE.OUTBOUND ? "reconnect" : null;
};
