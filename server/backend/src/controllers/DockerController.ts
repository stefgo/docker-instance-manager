import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { DockerStateService } from "../services/DockerStateService.js";
import { ProxyService } from "../services/ProxyService.js";
import { ImageUpdateService } from "../services/ImageUpdateService.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { logger } from "../core/logger.js";
import { DockerActionType, DOCKER_ACTION_TYPES, WS_EVENTS } from "@dim/shared";

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

        if (!body.action || !(DOCKER_ACTION_TYPES as readonly string[]).includes(body.action)) {
            return reply.code(400).send({ error: "Invalid or missing action" });
        }
        if (!body.target && body.action !== "image:prune") {
            return reply.code(400).send({ error: "Missing target" });
        }

        const socket = ProxyService.getClientSocket(clientId);
        if (!socket) {
            return reply.code(503).send({ error: "Client is not connected" });
        }

        const actionId = randomUUID();
        const resultPromise = ProxyService.waitForActionResult(actionId);
        ProxyService.sendDockerAction(clientId, {
            actionId,
            action: body.action,
            target: body.target,
            params: body.params,
        });

        try {
            const result = await resultPromise;

            if (result.success && (body.action === "image:pull" || body.action === "image:update") && body.target) {
                ImageUpdateService.checkForUpdate(body.target, []).then((checkResult) => {
                    DockerStateRepository.updateImageCheckResult(body.target, {
                        remoteDigest: checkResult.remoteDigest,
                        checkedAt: new Date().toISOString(),
                        ...(checkResult.error ? { error: checkResult.error } : {}),
                    });
                }).catch((err) => {
                    logger.warn({ err, imageRef: body.target }, "Post-pull image update check failed");
                });
            }

            return reply.code(result.success ? 200 : 500).send(result);
        } catch {
            return reply.code(504).send({ error: "Action timed out" });
        }
    }

    /**
     * Requests a connected client agent to send a fresh Docker state snapshot.
     */
    static async refresh(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };

        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.REQUEST_STATE_UPDATE, {});
        } catch {
            return reply.code(503).send({ error: "Client is not connected" });
        }

        return reply.code(202).send({ status: "refresh requested" });
    }

    /**
     * Checks if a newer version of a Docker image is available in its registry.
     * Query params: image (repoTag, e.g. "nginx:latest"), repoDigests (comma-separated)
     */
    static async checkImageUpdate(request: FastifyRequest, reply: FastifyReply) {
        const { repoTag, repoDigests } = request.query as { repoTag?: string; repoDigests?: string };

        if (!repoTag) {
            return reply.code(400).send({ error: "Missing query parameter: repoTag" });
        }

        const digestList = repoDigests ? repoDigests.split(",").map((d) => d.trim()).filter(Boolean) : [];
        const result = await ImageUpdateService.checkForUpdate(repoTag, digestList);

        DockerStateRepository.updateImageCheckResult(repoTag, {
            remoteDigest: result.remoteDigest,
            checkedAt: new Date().toISOString(),
            ...(result.error ? { error: result.error } : {}),
        });

        return result;
    }
}
