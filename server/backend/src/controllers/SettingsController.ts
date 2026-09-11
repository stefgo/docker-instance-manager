import { FastifyRequest, FastifyReply } from "fastify";
import {
    CleanupSettingsSchema,
    ValidateCronSchema,
    firstIssue,
} from "@dim/shared";
import { SettingsService } from "../services/SettingsService.js";
import { TokenCleanupService } from "../services/TokenCleanupService.js";
import { ImageUpdateCacheCleanupService } from "../services/ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "../services/ImageUpdateCheckSchedulerService.js";
import { ContainerAutoUpdateSchedulerService } from "../services/ContainerAutoUpdateSchedulerService.js";
import { NotificationCleanupService } from "../services/NotificationCleanupService.js";

export const SettingsController = {
    async getSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const settings = SettingsService.getAllSettings();
            return reply.send(settings);
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to fetch settings" });
        }
    },

    async updateSettings(request: FastifyRequest, reply: FastifyReply) {
        // This body is written into config.yaml. The schema checks the known keys and lets
        // unknown ones through -- see CleanupSettingsSchema for why.
        const parsed = CleanupSettingsSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }

        // A malformed expression used to be stored and then silently not scheduled.
        const cronExpr = parsed.data.container_auto_update_cron?.trim();
        if (
            cronExpr &&
            !ContainerAutoUpdateSchedulerService.validateCron(cronExpr).valid
        ) {
            return reply.code(400).send({
                error: "container_auto_update_cron: Invalid cron expression",
            });
        }

        try {
            SettingsService.updateSettings(parsed.data);
            return reply.send({ success: true });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
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
                .code(500)
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
                .code(500)
                .send({ error: "Failed to run image version cache cleanup" });
        }
    },

    async getSchedulerStatus(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send({
            imageUpdateCheck: ImageUpdateCheckSchedulerService.getStatus(),
            containerAutoUpdate: ContainerAutoUpdateSchedulerService.getStatus(),
            notificationCleanupLastRun: NotificationCleanupService.getLastRun(),
        });
    },

    async runImageUpdateCheck(_request: FastifyRequest, reply: FastifyReply) {
        try {
            const checked = await ImageUpdateCheckSchedulerService.run();
            return reply.send({ success: true, checked });
        } catch (e) {
            _request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to run image update check" });
        }
    },

    async runContainerAutoUpdate(request: FastifyRequest, reply: FastifyReply) {
        try {
            const result = await ContainerAutoUpdateSchedulerService.run();
            return reply.send({ success: true, ...result });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to run container auto-update" });
        }
    },

    async validateContainerAutoUpdateCron(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const parsed = ValidateCronSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const result = ContainerAutoUpdateSchedulerService.validateCron(
            parsed.data.expr,
        );
        return reply.send(result);
    },

    async listEligibleContainers(
        _request: FastifyRequest,
        reply: FastifyReply,
    ) {
        return reply.send({
            containers: ContainerAutoUpdateSchedulerService.getEligibleContainers(),
        });
    },

    async runNotificationCleanup(_request: FastifyRequest, reply: FastifyReply) {
        try {
            const result = NotificationCleanupService.run();
            return reply.send({ success: true, ...result });
        } catch (e) {
            _request.log.error(e);
            return reply.code(500).send({ error: "Failed to run notification cleanup" });
        }
    },
};
