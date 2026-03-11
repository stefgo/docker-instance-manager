import { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/UserRepository.js";

export class UserController {
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return UserRepository.findAll();
    }

    static async create(request: FastifyRequest, reply: FastifyReply) {
        const { username, password, auth_methods } = request.body as any;
        if (!username)
            return reply.code(400).send({ error: "Username required" });

        const methods = auth_methods || "local";
        if (methods.includes("local") && !password) {
            return reply
                .code(400)
                .send({ error: "Password required for local authentication" });
        }

        try {
            const hashedPassword = password
                ? bcrypt.hashSync(password, 10)
                : null;
            UserRepository.create(username, hashedPassword, methods);
            return { status: "created" };
        } catch (e: unknown) {
            if (
                e instanceof Error &&
                "code" in e &&
                e.code === "SQLITE_CONSTRAINT_UNIQUE"
            ) {
                return reply
                    .code(409)
                    .send({ error: "Username already exists" });
            }
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = request.params as { userId: string };
        const { password, auth_methods } = request.body as any;

        const user = UserRepository.findById(userId);
        if (!user) return reply.code(404).send({ error: "User not found" });

        const nextAuthMethods = auth_methods || user.auth_methods || "local";

        // Validation 1: Password change allowed ONLY for locally authenticated users.
        if (password) {
            if (!nextAuthMethods.includes("local")) {
                return reply.code(400).send({
                    error: "Cannot set password for user without local authentication",
                });
            }
            const hashedPassword = bcrypt.hashSync(password, 10);
            UserRepository.updatePassword(userId, hashedPassword);
        }

        // Validation 2: Users with local authentication MUST have a password.
        if (
            nextAuthMethods.includes("local") &&
            !user.password_hash &&
            !password
        ) {
            return reply.code(400).send({
                error: "User with local authentication must have a password",
            });
        }

        if (auth_methods) {
            UserRepository.updateAuthMethods(userId, auth_methods);
        }

        return { status: "updated" };
    }

    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = request.params as { userId: string };
        const user = request.user as any;

        if (user && String(user.id) === String(userId)) {
            return reply.code(400).send({ error: "Cannot delete yourself" });
        }

        const userCount = UserRepository.countAll();
        if (userCount <= 1) {
            return reply
                .code(400)
                .send({ error: "Cannot delete the last user" });
        }

        const info = UserRepository.delete(userId);
        if (info.changes === 0)
            return reply.code(404).send({ error: "User not found" });

        return { status: "deleted" };
    }
}
