import { DockerState } from "@dim/shared";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { logger } from "../core/logger.js";

export class DockerStateService {
    /**
     * Persists the Docker state for a client and returns the full state
     * (including updatedAt timestamp) for broadcasting.
     */
    static update(clientId: string, state: Omit<DockerState, "updatedAt">): DockerState {
        DockerStateRepository.upsert(clientId, state);
        const currentNames = new Set(
            state.containers.map((c) => c.names?.[0]?.replace(/^\//, "") ?? c.id),
        );
        ContainerAutoUpdateRepository.removeStaleForClient(clientId, currentNames);
        const saved = DockerStateRepository.findByClientId(clientId);
        if (!saved) {
            // Fallback – should never happen right after upsert
            logger.error({ clientId }, "DockerState not found after upsert");
            return { ...state, updatedAt: new Date().toISOString() };
        }
        return saved;
    }

    static getByClientId(clientId: string): DockerState | null {
        return DockerStateRepository.findByClientId(clientId);
    }
}
