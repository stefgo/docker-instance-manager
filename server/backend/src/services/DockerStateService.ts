import { DockerState, DockerContainer } from "@dim/shared";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { NotificationService } from "./NotificationService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { logger } from "../core/logger.js";

const SIGNIFICANT_STATES = new Set(["running", "exited", "dead", "restarting"]);

function detectContainerChanges(
    clientId: string,
    clientName: string,
    oldContainers: DockerContainer[],
    newContainers: DockerContainer[],
): void {
    const oldById = new Map(oldContainers.map((c) => [c.id, c]));
    const newById = new Map(newContainers.map((c) => [c.id, c]));

    for (const [id, newC] of newById) {
        const name = newC.names?.[0]?.replace(/^\//, "") ?? id;
        const ctx = { clientId, clientName, containerName: name, containerId: id };
        const oldC = oldById.get(id);

        if (!oldC) {
            NotificationService.create("info", `Container ${name} auf ${clientName} gestartet`, undefined, ctx);
            continue;
        }

        if (
            oldC.state !== newC.state &&
            SIGNIFICANT_STATES.has(oldC.state) &&
            SIGNIFICANT_STATES.has(newC.state)
        ) {
            NotificationService.create(
                "info",
                `Container ${name} auf ${clientName}: Status geändert (${oldC.state} → ${newC.state})`,
                undefined,
                ctx,
            );
        }

        if (oldC.imageId && newC.imageId && oldC.imageId !== newC.imageId) {
            NotificationService.create(
                "info",
                `Container ${name} auf ${clientName} läuft mit neuem Image`,
                undefined,
                { ...ctx, imageName: newC.image },
            );
        }
    }

    for (const [id, oldC] of oldById) {
        if (!newById.has(id)) {
            const name = oldC.names?.[0]?.replace(/^\//, "") ?? id;
            NotificationService.create(
                "info",
                `Container ${name} auf ${clientName} entfernt`,
                undefined,
                { clientId, clientName, containerName: name, containerId: id },
            );
        }
    }
}

export class DockerStateService {
    static update(clientId: string, state: Omit<DockerState, "updatedAt">): DockerState {
        const existing = DockerStateRepository.findByClientId(clientId);
        const oldContainers: DockerContainer[] = existing?.containers ?? [];

        DockerStateRepository.upsert(clientId, state);
        const currentNames = new Set(
            state.containers.map((c) => c.names?.[0]?.replace(/^\//, "") ?? c.id),
        );
        ContainerAutoUpdateRepository.removeStaleForClient(clientId, currentNames);
        const saved = DockerStateRepository.findByClientId(clientId);
        if (!saved) {
            logger.error({ clientId }, "DockerState not found after upsert");
            return { ...state, updatedAt: new Date().toISOString() };
        }

        if (oldContainers.length > 0) {
            const client = ClientRepository.findById(clientId);
            const clientName = client?.display_name || client?.hostname || clientId;
            detectContainerChanges(clientId, clientName, oldContainers, state.containers);
        }

        return saved;
    }

    static getByClientId(clientId: string): DockerState | null {
        return DockerStateRepository.findByClientId(clientId);
    }
}
