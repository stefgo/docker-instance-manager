import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/AuthController.js";
import { UserController } from "../controllers/UserController.js";
import { ClientController } from "../controllers/ClientController.js";
import { TokenController } from "../controllers/TokenController.js";
import { SettingsController } from "../controllers/SettingsController.js";
import { DockerController } from "../controllers/DockerController.js";
import { ContainerAutoUpdateController } from "../controllers/ContainerAutoUpdateController.js";

export default async function apiRoutes(fastify: FastifyInstance) {
    // Auth
    fastify.post("/login", AuthController.login);
    fastify.get("/auth/config", AuthController.getConfig);
    fastify.get("/auth/login", AuthController.oidcLogin);
    fastify.get("/auth/callback", AuthController.oidcCallback);

    // Register /api/v1 routes
    fastify.register(
        async (v1) => {
            // Protected Routes
            v1.register(async (protectedRoutes) => {
                protectedRoutes.addHook("onRequest", async (request, reply) => {
                    try {
                        await request.jwtVerify();
                    } catch (err) {
                        reply.send(err);
                    }
                });

                // Users
                protectedRoutes.get("/users", UserController.list);
                protectedRoutes.post("/users", UserController.create);
                protectedRoutes.put("/users/:userId", UserController.update);
                protectedRoutes.delete("/users/:userId", UserController.delete);

                // Clients
                protectedRoutes.get("/clients", ClientController.list);
                protectedRoutes.delete(
                    "/clients/:clientId",
                    ClientController.delete,
                );
                protectedRoutes.put(
                    "/clients/:clientId",
                    ClientController.update,
                );

                // Registration Tokens
                protectedRoutes.get("/tokens", TokenController.list);
                protectedRoutes.post("/tokens", TokenController.create);
                protectedRoutes.delete(
                    "/tokens/:token",
                    TokenController.delete,
                );

                // Docker
                protectedRoutes.get(
                    "/clients/:clientId/docker",
                    DockerController.getState,
                );
                protectedRoutes.post(
                    "/clients/:clientId/docker/action",
                    DockerController.sendAction,
                );
                protectedRoutes.post(
                    "/clients/:clientId/docker/refresh",
                    DockerController.refresh,
                );
                protectedRoutes.get(
                    "/docker/images/check-update",
                    DockerController.checkImageUpdate,
                );

                // Settings
                protectedRoutes.get(
                    "/settings/cleanup",
                    SettingsController.getSettings,
                );
                protectedRoutes.put(
                    "/settings/cleanup",
                    SettingsController.updateSettings,
                );
                protectedRoutes.post(
                    "/settings/cleanup/invalid-tokens",
                    SettingsController.runInvalidTokenCleanup,
                );
                protectedRoutes.post(
                    "/settings/cleanup/image-version-cache",
                    SettingsController.runImageVersionCacheCleanup,
                );
                protectedRoutes.get(
                    "/settings/scheduler-status",
                    SettingsController.getSchedulerStatus,
                );
                protectedRoutes.post(
                    "/settings/image-update-check/run",
                    SettingsController.runImageUpdateCheck,
                );
                protectedRoutes.post(
                    "/settings/container-auto-update/run",
                    SettingsController.runContainerAutoUpdate,
                );
                protectedRoutes.post(
                    "/settings/container-auto-update/validate-cron",
                    SettingsController.validateContainerAutoUpdateCron,
                );
                protectedRoutes.get(
                    "/settings/container-auto-update/eligible",
                    SettingsController.listEligibleContainers,
                );

                // Container Auto-Update — manual enrollment (per-container hierarchy)
                protectedRoutes.get(
                    "/containers/auto-update/manual",
                    ContainerAutoUpdateController.list,
                );
                protectedRoutes.post(
                    "/containers/auto-update/manual",
                    ContainerAutoUpdateController.addBatch,
                );
                protectedRoutes.delete(
                    "/containers/auto-update/manual",
                    ContainerAutoUpdateController.removeBatch,
                );
            });

            // Register Client (Public but API)
            v1.post("/register", TokenController.register);

            // Health check (Public ping)
            v1.get("/ping", async (request, reply) => {
                return { status: "ok" };
            });
        },
        { prefix: "/v1" },
    );
}
