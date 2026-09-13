import { FastifyRequest, FastifyReply } from "fastify";
import {
    CleanupSettingsSchema,
    ValidateCronSchema,
    firstIssue,
} from "@dim/shared";
import { appConfig } from "../config/AppConfig.js";
import { SettingsService } from "../services/SettingsService.js";
import { TokenCleanupService } from "../services/TokenCleanupService.js";
import { ImageUpdateCacheCleanupService } from "../services/ImageUpdateCacheCleanupService.js";
import { ImageUpdateCheckSchedulerService } from "../services/ImageUpdateCheckSchedulerService.js";
import { AutoUpdateRunService } from "../services/AutoUpdateRunService.js";
import { ProjectService } from "../services/ProjectService.js";
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
            !ProjectService.validateCron(cronExpr).valid
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

    /**
     * The schedulers the server still runs. Auto-update is not among them any more: the
     * agents run their own, and what they did is read back from their events -- see
     * `getContainerAutoUpdateStatus`.
     */
    async getSchedulerStatus(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send({
            imageUpdateCheck: ImageUpdateCheckSchedulerService.getStatus(),
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

    /** What every agent's autonomous auto-update currently looks like. */
    async getContainerAutoUpdateStatus(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(AutoUpdateRunService.getStatus());
    },

    /**
     * Asks every connected agent to run its auto-update now.
     *
     * It returns as soon as the commands are out, not when the runs are done: a run belongs
     * to the host, may recreate the agent's own container, and reports itself through its
     * events. Waiting for it here would only hold an HTTP request open for a result it
     * cannot deliver.
     */
    async runContainerAutoUpdate(_request: FastifyRequest, reply: FastifyReply) {
        const result = AutoUpdateRunService.triggerAll();
        return reply.send({ success: true, ...result });
    },

    async validateContainerAutoUpdateCron(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const parsed = ValidateCronSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const result = ProjectService.validateCron(
            parsed.data.expr,
        );
        return reply.send(result);
    },

    /**
     * The configured auto-update label, on its own. The container lists show which
     * containers carry it, and every signed-in user sees those lists -- reading the whole
     * settings block for one string is more than they need.
     */
    async getAutoUpdateLabel(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send({
            labelFilter: (appConfig.settings.container_auto_update_label ?? "").trim(),
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
