import { FastifyReply, FastifyRequest } from "fastify";
import { DockerStateService } from "../services/DockerStateService.js";
import { DockerActionError, ProxyService } from "../services/ProxyService.js";
import { ImageUpdateService } from "../services/ImageUpdateService.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { NotificationService } from "../services/NotificationService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { logger } from "@dim/shared/node";
import {
    DockerActionType,
    DockerActionRequestSchema,
    ImageUpdateCheckQuerySchema,
    WS_EVENTS,
    firstIssue,
} from "@dim/shared";

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
        // Checked here and not only by the agent: whatever passes goes straight to the
        // Docker socket of that host.
        const parsed = DockerActionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        // image:prune is the one action without a target; the agent ignores it there.
        const body = { ...parsed.data, target: parsed.data.target ?? "" };

        const client = ClientRepository.findById(clientId);
        const clientName = client?.display_name || client?.hostname || clientId;

        try {
            const result = await ProxyService.requestDockerAction(clientId, {
                action: body.action,
                target: body.target,
                params: body.params,
            });

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

            const ctx = { clientId, clientName, ...(body.target ? { imageName: body.target } : {}) };
            if (result.success) {
                const actionLabels: Partial<Record<DockerActionType, string>> = {
                    "image:update": `Image ${body.target} auf ${clientName} aktualisiert`,
                    "image:pull": `Image ${body.target} auf ${clientName} gepullt`,
                    "container:start": `Container ${body.target} auf ${clientName} gestartet`,
                    "container:stop": `Container ${body.target} auf ${clientName} gestoppt`,
                    "container:restart": `Container ${body.target} auf ${clientName} neu gestartet`,
                    "container:recreate": `Container ${body.target} auf ${clientName} neu erstellt`,
                    "container:remove": `Container ${body.target} auf ${clientName} entfernt`,
                    "container:pause": `Container ${body.target} auf ${clientName} pausiert`,
                    "container:unpause": `Container ${body.target} auf ${clientName} fortgesetzt`,
                };
                const msg = actionLabels[body.action];
                if (msg) {
                    const isImageAction = body.action.startsWith("image:");
                    const notifCtx = isImageAction
                        ? ctx
                        : { clientId, clientName, containerName: body.target };
                    NotificationService.create("info", msg, undefined, notifCtx);
                }
            } else {
                NotificationService.create(
                    "warning",
                    `Aktion ${body.action} für ${body.target} auf ${clientName} fehlgeschlagen`,
                    result.error,
                    { clientId, clientName, containerName: body.target },
                );
            }

            return reply.code(result.success ? 200 : 500).send(result);
        } catch (err) {
            const reason = err instanceof DockerActionError ? err.reason : "timeout";
            // Nothing was sent, so there is nothing to notify about.
            if (reason === "not-connected") {
                return reply.code(503).send({ error: "Client is not connected" });
            }
            // Texts stay German for now; unifying the notification language is F12.
            NotificationService.create(
                "warning",
                reason === "disconnected"
                    ? `Aktion ${body.action} für ${body.target} auf ${clientName} abgebrochen: Verbindung zum Client getrennt`
                    : `Aktion ${body.action} für ${body.target} auf ${clientName} hat das Timeout überschritten`,
                undefined,
                { clientId, clientName, containerName: body.target },
            );
            return reason === "disconnected"
                ? reply.code(503).send({ error: "Client disconnected before reporting a result" })
                : reply.code(504).send({ error: "Action timed out" });
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
        const parsed = ImageUpdateCheckQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { repoTag, repoDigests } = parsed.data;

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
