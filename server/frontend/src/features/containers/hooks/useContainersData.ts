import { useMemo } from "react";
import { type ContainerNode, buildContainerGroups } from "../lib/containerGroups";
import { useProjectAssignment } from "../../projects/hooks/useProjectMembers";
import { useAutoUpdateLabel } from "../../../queries/autoUpdate";
import { useClients } from "../../../queries/clients";
import { useDockerStates } from "../../../queries/docker";

/**
 * Every container of the fleet, grouped by name and image, narrowed to one project by
 * `projectId`. The grouping itself is `buildContainerGroups`; this only reads what it is
 * built from.
 */
export function useContainersData(projectId?: string): ContainerNode[] {
    const dockerStates = useDockerStates();
    const clients = useClients().clients;
    const labelFilter = useAutoUpdateLabel();
    const assignment = useProjectAssignment();

    return useMemo(
        () => buildContainerGroups({ clients, dockerStates, assignment, labelFilter, projectId }),
        [clients, dockerStates, assignment, labelFilter, projectId],
    );
}
