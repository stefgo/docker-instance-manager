import { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../services/AuthService.js";
import { appConfig } from "../config/AppConfig.js";

export class AuthController {
    static async login(request: FastifyRequest, reply: FastifyReply) {
        const { username, password } = request.body as any;
        const result = AuthService.checkLocalAuth(username, password);

        if (result.error) {
            return reply.code(401).send({ error: result.error });
        }

        const token = request.server.jwt.sign({ username, id: result.user.id });
        return { token };
    }

    static async getConfig(request: FastifyRequest, reply: FastifyReply) {
        return AuthService.getAuthConfig();
    }

    static async oidcLogin(request: FastifyRequest, reply: FastifyReply) {
        try {
            const url = await AuthService.generateOidcUrl();
            return reply.redirect(url);
        } catch (e: unknown) {
            return reply
                .code(404)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async oidcCallback(request: FastifyRequest, reply: FastifyReply) {
        try {
            // Reconstruct URL. helper needed?
            // Fastify request.url only gives path. Need host.
            // But we know redirect_uri from config.
            if (!appConfig.oidc || !appConfig.oidc.enabled) {
                throw new Error("OIDC is not configured or disabled");
            }
            const redirectUriObj = new URL(appConfig.oidc.redirect_uri);
            const currentUrl = new URL(request.url, redirectUriObj.origin);

            const user = await AuthService.handleOidcCallback(currentUrl);
            const token = request.server.jwt.sign({
                username: user.username,
                id: user.id,
            });

            return reply.redirect(`/login?token=${token}`);
        } catch (e: unknown) {
            return reply.code(500).send({
                error:
                    "Authentication failed: " +
                    (e instanceof Error ? e.message : String(e)),
            });
        }
    }
}
