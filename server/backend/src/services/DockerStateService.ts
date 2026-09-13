import { DockerState } from "@dim/shared";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { logger } from "@dim/shared/node";

/**
 * Stores what an agent last reported about its host.
 *
 * It used to report container changes as well, by diffing the new snapshot against the
 * previous one. That is gone: the agent watches the Docker event stream and reports what it
 * sees as activity events, which carry an exit code, an OOM kill, a health transition and
 * the run or action that caused them -- none of which a diff of two snapshots contains.
 */
export class DockerStateService {
    static update(clientId: string, state: Omit<DockerState, "updatedAt">): DockerState {
        DockerStateRepository.upsert(clientId, state);
        const saved = DockerStateRepository.findByClientId(clientId);
        if (!saved) {
            logger.error({ clientId }, "DockerState not found after upsert");
            return { ...state, updatedAt: new Date().toISOString() };
        }
        return saved;
    }

    static getByClientId(clientId: string): DockerState | null {
        return DockerStateRepository.findByClientId(clientId);
    }
}
