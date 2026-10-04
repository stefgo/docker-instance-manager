import { useMemo } from "react";
import { useProjectAssignment } from "../../projects/hooks/useProjectMembers";
import { type RepositoryNode, buildImageTree } from "../lib/imageTree";
import { useClients } from "../../../queries/clients";
import { useDockerStates } from "../../../queries/docker";

/**
 * Every image of the fleet as a repository/tag/digest tree, narrowed to one project by
 * `projectId`. The tree itself is `buildImageTree`; this only reads what it is built from.
 */
export function useImagesData(projectId?: string): RepositoryNode[] {
    const { clients } = useClients();
    const dockerStates = useDockerStates();
    const assignment = useProjectAssignment();

    return useMemo(
        () => buildImageTree({ clients, dockerStates, assignment, projectId }),
        [clients, dockerStates, assignment, projectId],
    );
}
