import { useEffect, useMemo } from "react";
import { COMPOSE_PROJECT_LABEL, DockerContainer, DockerImage } from "@dim/shared";
import { useClientStore } from "../../../stores/useClientStore";
import { useDockerStore } from "../../../stores/useDockerStore";

/** What one host contributes to a project. */
export interface ProjectClientMembers {
    clientId: string;
    containers: DockerContainer[];
    /** The images behind those containers, resolved through their `configImage`. */
    images: DockerImage[];
}

export interface ProjectMembers {
    perClient: ProjectClientMembers[];
    clientIds: string[];
    containerCount: number;
    /** Distinct `configImage` values across every host, which is what a stack is updated by. */
    imageCount: number;
}

export const EMPTY_MEMBERS: ProjectMembers = {
    perClient: [],
    clientIds: [],
    containerCount: 0,
    imageCount: 0,
};

export function projectNameOf(container: DockerContainer): string | null {
    const name = container.labels?.[COMPOSE_PROJECT_LABEL];
    return name && name.length > 0 ? name : null;
}

/**
 * Project membership for every stack currently visible on the fleet.
 *
 * Derived from the Docker state the store already holds rather than fetched: the states
 * arrive over the WebSocket, so a container that joins or leaves a stack moves it here
 * without anything being asked for again. The server resolves the same thing for its own
 * API; this is the live half of it.
 */
export function useAllProjectMembers(): Map<string, ProjectMembers> {
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
    const clients = useClientStore((s) => s.clients);

    useEffect(() => {
        clients.forEach((c) => fetchDockerState(c.id));
    }, [clients, fetchDockerState]);

    return useMemo(() => {
        const byProject = new Map<string, { perClient: ProjectClientMembers[]; images: Set<string> }>();

        for (const [clientId, state] of Object.entries(dockerStates)) {
            const containersHere = new Map<string, DockerContainer[]>();
            for (const container of state.containers) {
                const name = projectNameOf(container);
                if (!name) continue;
                const list = containersHere.get(name) ?? [];
                list.push(container);
                containersHere.set(name, list);
            }

            for (const [name, containers] of containersHere) {
                let entry = byProject.get(name);
                if (!entry) {
                    entry = { perClient: [], images: new Set() };
                    byProject.set(name, entry);
                }

                // One image per distinct configImage, not per container: a stack that runs
                // two containers off the same image has one image in it.
                const refs = new Set<string>();
                for (const container of containers) {
                    const ref = container.configImage ?? container.image;
                    if (ref) {
                        refs.add(ref);
                        entry.images.add(ref);
                    }
                }
                const images = state.images.filter((img) =>
                    img.repoTags.some((tag) => refs.has(tag)),
                );

                entry.perClient.push({ clientId, containers, images });
            }
        }

        const result = new Map<string, ProjectMembers>();
        for (const [name, { perClient, images }] of byProject) {
            result.set(name, {
                perClient,
                clientIds: perClient.map((m) => m.clientId),
                containerCount: perClient.reduce((sum, m) => sum + m.containers.length, 0),
                imageCount: images.size,
            });
        }
        return result;
    }, [dockerStates]);
}
