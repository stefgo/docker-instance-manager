import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { DockerStateService } from "../services/DockerStateService.js";
import { ProxyService } from "../services/ProxyService.js";
import { ImageUpdateService } from "../services/ImageUpdateService.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { DockerActionType } from "@docker-instance-manager/shared";

const VALID_ACTIONS: DockerActionType[] = [
    "container:start",
    "container:stop",
    "container:restart",
    "container:remove",
    "container:pause",
    "container:unpause",
    "container:recreate",
    "image:remove",
    "image:pull",
    "image:update",
    "volume:remove",
    "network:remove",
];

export class DockerController {
    /**
     * Returns the last known Docker state for a client (from DB).
     */
    static async getState(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const state = DockerStateService.getByClientId(clientId);
        if (!state) {
            return reply.code(404).send({ error: "No Docker state found for this client" });
        }
        return state;
    }

    /**
     * Sends a Docker action to a connected client agent.
     */
    static async sendAction(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = request.body as { action: DockerActionType; target: string; params?: Record<string, any> };

        if (!body.action || !VALID_ACTIONS.includes(body.action)) {
            return reply.code(400).send({ error: "Invalid or missing action" });
        }
        if (!body.target) {
            return reply.code(400).send({ error: "Missing target" });
        }

        const socket = ProxyService.getClientSocket(clientId);
        if (!socket) {
            return reply.code(503).send({ error: "Client is not connected" });
        }

        const actionId = randomUUID();
        ProxyService.sendDockerAction(clientId, {
            actionId,
            action: body.action,
            target: body.target,
            params: body.params,
        });

        return { actionId };
    }

    /**
     * Checks if a newer version of a Docker image is available in its registry.
     * Query params: image (repoTag, e.g. "nginx:latest"), repoDigests (comma-separated)
     */
    static async checkImageUpdate(request: FastifyRequest, reply: FastifyReply) {
        const { image, repoDigests } = request.query as { image?: string; repoDigests?: string };

        if (!image) {
            return reply.code(400).send({ error: "Missing query parameter: image" });
        }

        const digestList = repoDigests ? repoDigests.split(",").map((d) => d.trim()).filter(Boolean) : [];
        const result = await ImageUpdateService.checkForUpdate(image, digestList);

        DockerStateRepository.updateImageCheckResult(image, {
            hasUpdate: result.hasUpdate,
            localDigest: result.localDigest,
            remoteDigest: result.remoteDigest,
            checkedAt: new Date().toISOString(),
            ...(result.error ? { error: result.error } : {}),
        });

        return result;
    }
}
