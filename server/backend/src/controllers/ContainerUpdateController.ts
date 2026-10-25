import { FastifyReply, FastifyRequest } from "fastify";
import { ContainerUpdateService } from "../services/ContainerUpdateService.js";

export class ContainerUpdateController {
    /** The whole stored history, newest first. The retention keeps it bounded. */
    static async list(_request: FastifyRequest, _reply: FastifyReply) {
        return ContainerUpdateService.list();
    }
}
