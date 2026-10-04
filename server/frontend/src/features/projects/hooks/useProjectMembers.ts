import { useMemo } from "react";
import type { QueryHostState } from "@dim/shared";
import {
    type ContainerAssignment,
    type ProjectMembers,
    buildProjectMembers,
    hostStates,
    projectAssignment,
} from "../lib/projectMembers";
import { useClients } from "../../../queries/clients";
import { useDockerStates } from "../../../queries/docker";
import { useProjects } from "../../../queries/projects";

/**
 * Every host with the containers it reports and the identity a project query matches
 * against. Loads the Docker state of every client it does not have yet.
 */
export function useHostStates(): QueryHostState[] {
    const dockerStates = useDockerStates();
    const clients = useClients().clients;

    return useMemo(() => hostStates(clients, dockerStates), [clients, dockerStates]);
}

/**
 * The project every container of the fleet belongs to, keyed by `containerKey`.
 *
 * Derived from the Docker state the cache already holds rather than fetched: the states
 * arrive over the WebSocket, so a container that starts or stops matching a query moves
 * here without anything being asked for again.
 */
export function useProjectAssignment(): Map<string, ContainerAssignment> {
    const states = useHostStates();
    const projects = useProjects().projects;

    return useMemo(() => projectAssignment(states, projects), [states, projects]);
}

/** Project membership for every managed project, keyed by project id. */
export function useAllProjectMembers(): Map<string, ProjectMembers> {
    const dockerStates = useDockerStates();
    const assignment = useProjectAssignment();

    return useMemo(() => buildProjectMembers(dockerStates, assignment), [dockerStates, assignment]);
}
