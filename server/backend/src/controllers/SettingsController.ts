import { FastifyRequest, FastifyReply } from "fastify";
import { SettingsService } from "../services/SettingsService.js";
import { TokenCleanupService } from "../services/TokenCleanupService.js";
import { ImageUpdateCacheCleanupService } from "../services/ImageUpdateCacheCleanupService.js";

export const SettingsController = {
    async getSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const settings = SettingsService.getAllSettings();
            return reply.send(settings);
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to fetch settings" });
        }
    },

    async updateSettings(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as Record<string, any>;

        if (!body || typeof body !== "object") {
            return reply.status(400).send({ error: "Invalid settings data" });
        }

        try {
            SettingsService.updateSettings(body);
            return reply.send({ success: true });
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to update settings" });
        }
    },

    async runInvalidTokenCleanup(request: FastifyRequest, reply: FastifyReply) {
        try {
            const result = TokenCleanupService.run();
            return reply.send({ success: true, ...result });
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to run token cleanup" });
        }
    },

    async runImageVersionCacheCleanup(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        try {
            const result = ImageUpdateCacheCleanupService.run();
            return reply.send({ success: true, ...result });
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to run image version cache cleanup" });
        }
    },
};
