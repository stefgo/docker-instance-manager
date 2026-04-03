import { useMemo } from "react";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";

export interface ContainerRow {
  id: string;
  name: string;
  configImage: string;
  clientCount: number;
  clientNames: string[];
}

export function useContainersData(): ContainerRow[] {
  const dockerStates = useDockerStore((s) => s.dockerStates);
  const clients = useClientStore((s) => s.clients);

  return useMemo(() => {
    const clientMap = new Map(clients.map((c) => [c.id, c.displayName ?? c.hostname]));
    const grouped = new Map<string, { clientIds: Set<string> }>();

    for (const [clientId, state] of Object.entries(dockerStates)) {
      for (const container of state.containers) {
        const name = container.names[0]?.replace(/^\//, "") ?? container.id;
        const configImage = container.configImage ?? container.image;
        const key = `${name}||${configImage}`;

        let entry = grouped.get(key);
        if (!entry) {
          entry = { clientIds: new Set() };
          grouped.set(key, entry);
        }
        entry.clientIds.add(clientId);
      }
    }

    return Array.from(grouped.entries()).map(([key, { clientIds }]) => {
      const [name, configImage] = key.split("||");
      return {
        id: key,
        name,
        configImage,
        clientCount: clientIds.size,
        clientNames: Array.from(clientIds).map((id) => clientMap.get(id) ?? id),
      };
    });
  }, [dockerStates, clients]);
}
