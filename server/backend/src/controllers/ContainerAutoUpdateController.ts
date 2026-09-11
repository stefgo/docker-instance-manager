import { FastifyRequest, FastifyReply } from "fastify";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { WS_EVENTS, ManualAutoUpdateEntriesSchema, firstIssue } from "@dim/shared";

function getLabelFilterRaw(): string {
    return (appConfig.settings.container_auto_update_label ?? "").trim();
}

function buildPayload() {
    return {
        entries: ContainerAutoUpdateRepository.list(),
        labelFilter: getLabelFilterRaw(),
    };
}

function broadcastManualUpdate() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.MANUAL_AUTO_UPDATE_UPDATE,
        payload: buildPayload(),
    });
}

export const ContainerAutoUpdateController = {
    async list(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(buildPayload());
    },

    async addBatch(request: FastifyRequest, reply: FastifyReply) {
        // Invalid entries used to be dropped silently, so a request with a typo succeeded
        // and changed nothing. The whole request is rejected now and names the entry.
        const parsed = ManualAutoUpdateEntriesSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { entries } = parsed.data;
        try {
            for (const e of entries) {
                if (e.clientId === "") {
                    ContainerAutoUpdateRepository.addGlobal(e.containerName);
                } else {
                    ContainerAutoUpdateRepository.addClient(e.containerName, e.clientId);
                }
            }
            broadcastManualUpdate();
            return reply.send({ success: true, added: entries.length });
        } catch (e) {
            request.log.error(e);
            return reply.code(500).send({ error: "Failed to add manual entries" });
        }
    },

    async removeBatch(request: FastifyRequest, reply: FastifyReply) {
        // Invalid entries used to be dropped silently, so a request with a typo succeeded
        // and changed nothing. The whole request is rejected now and names the entry.
        const parsed = ManualAutoUpdateEntriesSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { entries } = parsed.data;
        try {
            for (const e of entries) {
                if (e.clientId === "") {
                    ContainerAutoUpdateRepository.removeGlobal(e.containerName);
                } else {
                    ContainerAutoUpdateRepository.removeClient(e.containerName, e.clientId);
                }
            }
            broadcastManualUpdate();
            return reply.send({ success: true });
        } catch (e) {
            request.log.error(e);
            return reply.code(500).send({ error: "Failed to remove manual entries" });
        }
    },
};
