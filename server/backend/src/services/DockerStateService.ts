import { DockerState, DockerContainer, NotificationContext } from "@dim/shared";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { NotificationService } from "./NotificationService.js";
import { NotificationGroupService } from "./NotificationGroupService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { logger } from "@dim/shared/node";

const SIGNIFICANT_STATES = new Set(["running", "exited", "dead", "restarting"]);

/**
 * Reports one container change. While an operation on that container is running -- a
 * "Pull & Recreate" causes a removal, a start and a new image behind the same name -- the
 * change becomes a step of that operation's notification instead of one of its own.
 * `step` carries no client name: the notification it lands on already names the client.
 */
function reportChange(
    clientId: string,
    containerName: string,
    message: string,
    step: string,
    ctx: NotificationContext,
): void {
    if (NotificationGroupService.addStep(clientId, containerName, "info", step)) return;
    NotificationService.create("info", message, undefined, ctx);
}

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
            reportChange(
                clientId,
                name,
                `Container ${name} started on ${clientName}`,
                `Container ${name} started`,
                ctx,
            );
            continue;
        }

        if (
            oldC.state !== newC.state &&
            SIGNIFICANT_STATES.has(oldC.state) &&
            SIGNIFICANT_STATES.has(newC.state)
        ) {
            reportChange(
                clientId,
                name,
                `Container ${name} on ${clientName} changed state (${oldC.state} → ${newC.state})`,
                `Container ${name} changed state (${oldC.state} → ${newC.state})`,
                ctx,
            );
        }

        if (oldC.imageId && newC.imageId && oldC.imageId !== newC.imageId) {
            reportChange(
                clientId,
                name,
                `Container ${name} on ${clientName} runs a new image`,
                `Container ${name} runs a new image`,
                { ...ctx, imageName: newC.image },
            );
        }
    }

    for (const [id, oldC] of oldById) {
        if (!newById.has(id)) {
            const name = oldC.names?.[0]?.replace(/^\//, "") ?? id;
            reportChange(
                clientId,
                name,
                `Container ${name} removed from ${clientName}`,
                `Container ${name} removed`,
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
