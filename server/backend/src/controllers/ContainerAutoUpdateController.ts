import { FastifyRequest, FastifyReply } from "fastify";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { WS_EVENTS } from "@dim/shared";

interface EntryInput {
    containerName?: string;
    clientId?: string;
}

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

function normalizeEntries(input: unknown): Array<{ containerName: string; clientId: string }> {
    if (!Array.isArray(input)) return [];
    const result: Array<{ containerName: string; clientId: string }> = [];
    for (const item of input as EntryInput[]) {
        if (typeof item?.containerName === "string" && item.containerName.trim() !== "") {
            result.push({
                containerName: item.containerName,
                clientId: typeof item?.clientId === "string" ? item.clientId : "",
            });
        }
    }
    return result;
}

export const ContainerAutoUpdateController = {
    async list(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(buildPayload());
    },

    async addBatch(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as { entries?: EntryInput[] };
        const entries = normalizeEntries(body?.entries);
        if (entries.length === 0) {
            return reply.status(400).send({ error: "No valid entries provided" });
        }
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
            return reply.status(500).send({ error: "Failed to add manual entries" });
        }
    },

    async removeBatch(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as { entries?: EntryInput[] };
        const entries = normalizeEntries(body?.entries);
        if (entries.length === 0) {
            return reply.status(400).send({ error: "No valid entries provided" });
        }
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
            return reply.status(500).send({ error: "Failed to remove manual entries" });
        }
    },
};
