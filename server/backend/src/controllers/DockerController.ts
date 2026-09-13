import { FastifyReply, FastifyRequest } from "fastify";
import { DockerStateService } from "../services/DockerStateService.js";
import { DockerActionError, ProxyService } from "../services/ProxyService.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ActivityService } from "../services/ActivityService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ImageUpdateService, logger } from "@dim/shared/node";
import {
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

        // The one thing the server knows and the agent does not: that a user asked for
        // this. It is reported as its own event, and its actionId is the correlationId the
        // agent stamps on every container and image event the action goes on to cause --
        // so the group forms out of what each side actually knows, not out of matching
        // names inside a time window.
        const isImageAction = body.action.startsWith("image:");
        const subject = isImageAction
            ? { imageRef: body.target }
            : { containerName: body.target };

        // Set once the action is on the wire, so a failure can be reported under the same
        // group as the request. Nothing is sent when the agent is not connected, and then
        // there is no group and nothing to report either.
        let actionId: string | null = null;
        const reportFailure = (error: string) => {
            if (!actionId) return;
            ActivityService.record({
                kind: "action.failed",
                level: "warning",
                clientId,
                correlationId: actionId,
                subject,
                data: { action: body.action, clientName, error },
            });
        };

        try {
            const result = await ProxyService.requestDockerAction(
                clientId,
                {
                    action: body.action,
                    target: body.target,
                    params: body.params,
                },
                undefined,
                (id) => {
                    actionId = id;
                    ActivityService.record({
                        kind: "action.requested",
                        level: "info",
                        clientId,
                        correlationId: id,
                        subject,
                        data: { action: body.action, clientName },
                    });
                },
            );

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

            if (!result.success) {
                reportFailure(result.error ?? "The agent reported no reason");
            }

            return reply.code(result.success ? 200 : 500).send(result);
        } catch (err) {
            const reason = err instanceof DockerActionError ? err.reason : "timeout";
            if (reason === "not-connected") {
                return reply.code(503).send({ error: "Client is not connected" });
            }
            // Whatever the host did before the connection or the clock ran out is reported
            // by the agent itself, under this same correlationId -- late, if need be.
            reportFailure(
                reason === "disconnected"
                    ? "The connection to the client was lost before it reported a result"
                    : "The client did not report a result in time",
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
