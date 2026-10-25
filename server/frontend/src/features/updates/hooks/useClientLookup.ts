import { useMemo } from "react";
import { useClients } from "../../../queries/clients";
import { clientName } from "../../../utils";
import type { ClientLookup } from "../lib/updateHistory";

/**
 * The clients by id, for the update history's rows. An update outlives nothing: a deleted
 * client takes its updates along, so an id the list does not know is one whose client is
 * being deleted or not loaded yet -- it is shown by its id, without a link.
 */
export function useClientLookup(): ClientLookup {
    const { clients } = useClients();
    return useMemo(() => {
        const names = new Map(clients.map((c) => [c.id, clientName(c)]));
        return {
            name: (clientId) => names.get(clientId) ?? clientId,
            exists: (clientId) => names.has(clientId),
        };
    }, [clients]);
}
