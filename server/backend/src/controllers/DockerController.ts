import { FastifyReply, FastifyRequest } from "fastify";
import { DockerStateService } from "../services/DockerStateService.js";
import { DockerActionError, ProxyService } from "../services/ProxyService.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { NotificationService } from "../services/NotificationService.js";
import { NotificationGroupService } from "../services/NotificationGroupService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ImageUpdateService, logger } from "@dim/shared/node";
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

        // A "Pull & Recreate" pulls the image and then stops, removes and recreates every
        // container behind it. The container events that come back are steps of this one
        // operation, so they are collected under its notification instead of being
        // reported one by one. The group has to be open before the action is sent: the
        // agent pushes the first state update while the action is still running.
        const isImageUpdate = body.action === "image:update" && !!body.target;

        try {
            if (isImageUpdate) {
                NotificationGroupService.begin(
                    clientId,
                    body.target,
                    `Pull & Recreate of ${body.target} started`,
                );
            }

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
                    "image:update": `Image ${body.target} updated on ${clientName}`,
                    "image:pull": `Image ${body.target} pulled on ${clientName}`,
                    "container:start": `Container ${body.target} started on ${clientName}`,
                    "container:stop": `Container ${body.target} stopped on ${clientName}`,
                    "container:restart": `Container ${body.target} restarted on ${clientName}`,
                    "container:recreate": `Container ${body.target} recreated on ${clientName}`,
                    "container:remove": `Container ${body.target} removed from ${clientName}`,
                    "container:pause": `Container ${body.target} paused on ${clientName}`,
                    "container:unpause": `Container ${body.target} resumed on ${clientName}`,
                };
                const msg = actionLabels[body.action];
                if (msg) {
                    const isImageAction = body.action.startsWith("image:");
                    const notifCtx = isImageAction
                        ? ctx
                        : { clientId, clientName, containerName: body.target };
                    const steps = isImageUpdate
                        ? NotificationGroupService.finish(
                            clientId,
                            body.target,
                            `Image ${body.target} pulled, affected containers recreated`,
                        )
                        : undefined;
                    const notification = NotificationService.create("info", msg, undefined, notifCtx, steps);
                    if (isImageUpdate) {
                        NotificationGroupService.attach(clientId, body.target, notification.id);
                    }
                }
            } else {
                const steps = isImageUpdate
                    ? NotificationGroupService.finish(clientId, body.target, "The update failed")
                    : undefined;
                const notification = NotificationService.create(
                    "warning",
                    `Action ${body.action} on ${body.target} failed on ${clientName}`,
                    result.error,
                    { clientId, clientName, containerName: body.target },
                    steps,
                );
                if (isImageUpdate) {
                    NotificationGroupService.attach(clientId, body.target, notification.id);
                }
            }

            return reply.code(result.success ? 200 : 500).send(result);
        } catch (err) {
            const reason = err instanceof DockerActionError ? err.reason : "timeout";
            // Nothing was sent, so there is nothing to notify about.
            if (reason === "not-connected") {
                return reply.code(503).send({ error: "Client is not connected" });
            }
            // Whatever the host already did is reported with this notification. The group
            // is not attached to it: no result is coming for it any more, so the `finally`
            // below ends it.
            const steps = isImageUpdate
                ? NotificationGroupService.finish(clientId, body.target)
                : undefined;
            NotificationService.create(
                "warning",
                reason === "disconnected"
                    ? `Action ${body.action} on ${body.target} aborted on ${clientName}: the connection to the client was lost`
                    : `Action ${body.action} on ${body.target} timed out on ${clientName}`,
                undefined,
                { clientId, clientName, containerName: body.target },
                steps,
            );
            return reason === "disconnected"
                ? reply.code(503).send({ error: "Client disconnected before reporting a result" })
                : reply.code(504).send({ error: "Action timed out" });
        } finally {
            // Every path out ends the group here, so none can be left open swallowing the
            // changes it covers. One that was attached to its notification is in its grace
            // window and is left alone.
            if (isImageUpdate) NotificationGroupService.release(clientId, body.target);
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
