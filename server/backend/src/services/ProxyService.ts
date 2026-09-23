import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import {
    WS_EVENTS,
    CLIENT_STATUS,
    CONNECTION_MODE,
    DockerState,
    DockerAction,
    DockerActionResult,
    DockerActionResultSchema,
    DockerUpdatePayloadSchema,
    firstIssue,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { DockerStateService } from "./DockerStateService.js";

/** Why a Docker action did not produce a result, so callers can answer accordingly. */
export type DockerActionFailure = "not-connected" | "disconnected" | "timeout";

export class DockerActionError extends Error {
    constructor(
        readonly reason: DockerActionFailure,
        message: string,
    ) {
        super(message);
        this.name = "DockerActionError";
    }
}

/** A Docker action sent to an agent and still waiting for its DOCKER_ACTION_RESULT. */
interface PendingAction {
    clientId: string;
    /**
     * The socket the action went out on. The agent answers over that same socket, so once it
     * closes the answer is never coming -- even if the agent has already reconnected on a
     * new one.
     */
    socket: WebSocket;
    resolve: (result: DockerActionResult) => void;
    reject: (err: DockerActionError) => void;
    timer: NodeJS.Timeout;
}

/** How long an action may run on the agent. A pull of a large image takes a while. */
const DOCKER_ACTION_TIMEOUT_MS = 120_000;

export class ProxyService {
    private static connectedClients = new Map<string, WebSocket>();
    /** Each dashboard socket with the id of the user whose session opened it. */
    private static dashboardClients = new Map<WebSocket, number>();
    private static pendingActions = new Map<string, PendingAction>();
    /**
     * What each connected agent said it can do, from its AUTH payload. Kept with the
     * connection rather than in the database: it describes the build that is on the wire
     * right now, and an agent updated while it was offline must not be credited with what
     * its predecessor could do.
     */
    private static clientCapabilities = new Map<string, Set<string>>();

    static registerClient(clientId: string, socket: WebSocket, capabilities: string[] = []) {
        const existing = this.connectedClients.get(clientId);
        if (existing) {
            existing.close(4000, "Replaced by new connection");
        }
        this.connectedClients.set(clientId, socket);
        this.clientCapabilities.set(clientId, new Set(capabilities));
    }

    /** Whether the agent currently connected under this id declared that capability. */
    static hasCapability(clientId: string, capability: string): boolean {
        return this.clientCapabilities.get(clientId)?.has(capability) ?? false;
    }

    /**
     * Everything the agent currently connected under this id declared, or `null` if none
     * is connected. For reporting the answer onwards; a server-side decision asks
     * `hasCapability` about the one capability it needs.
     */
    static getCapabilities(clientId: string): string[] | null {
        const capabilities = this.clientCapabilities.get(clientId);
        return capabilities ? [...capabilities] : null;
    }

    static getConnectedClientIds(): string[] {
        return [...this.connectedClients.keys()];
    }

    /**
     * Called when an agent's socket closes. Any action still waiting on that socket fails at
     * once: its answer would have come back over the closed socket, so waiting out the
     * two-minute timeout only kept the caller -- a dashboard request, an auto-update sweep --
     * hanging for nothing.
     */
    static unregisterClient(clientId: string, socket: WebSocket) {
        if (this.connectedClients.get(clientId) === socket) {
            this.connectedClients.delete(clientId);
            this.clientCapabilities.delete(clientId);
        }
        this.failPendingActions(socket);
    }

    static addDashboardClient(socket: WebSocket, userId: number) {
        this.dashboardClients.set(socket, userId);
    }

    static removeDashboardClient(socket: WebSocket) {
        this.dashboardClients.delete(socket);
    }

    static getClientSocket(clientId: string): WebSocket | undefined {
        return this.connectedClients.get(clientId);
    }

    static getClientsWithStatus() {
        const clients = ClientRepository.findAll();
        return clients.map((client) => ({
            id: client.id,
            hostname: client.hostname,
            displayName: client.display_name,
            status: this.connectedClients.has(client.id)
                ? CLIENT_STATUS.ONLINE
                : CLIENT_STATUS.OFFLINE,
            lastSeen: client.last_seen,
            version: client.version,
            connectionMode: client.connection_mode ?? CONNECTION_MODE.INBOUND,
            inboundAllowedIp: client.inbound_allowed_ip,
            inboundLastIp: client.inbound_last_ip,
            outboundTargetAddress: client.outbound_target_address ?? null,
            autoUpdateCron: client.auto_update_cron,
            /**
             * Only meaningful while the agent is connected: what it can do is a property of
             * the build on the wire, not of the stored client. `null` for an offline one is
             * "not known right now", which is the honest answer and reads differently in the
             * list from an empty list -- a connected agent that can do none of it.
             */
            capabilities: this.connectedClients.has(client.id)
                ? this.getCapabilities(client.id) ?? []
                : null,
            createdAt: client.created_at,
            updatedAt: client.updated_at,
        }));
    }

    /**
     * Broadcasts the complete list of registered clients and their online status
     * to all active dashboard WebSocket sessions.
     */
    static broadcastClientUpdate() {
        try {
            // Serialised once. This used to stringify, parse the result straight back and
            // hand the object to broadcastToDashboard, which stringified it again -- three
            // passes over the full client list on every connect and disconnect.
            this.broadcastToDashboard(
                JSON.stringify({
                    type: WS_EVENTS.CLIENTS_UPDATE,
                    payload: this.getClientsWithStatus(),
                }),
            );
        } catch (e) {
            logger.error({ err: e }, "Broadcast error");
        }
    }

    static broadcastToDashboard(message: unknown) {
        const msgStr =
            typeof message === "string" ? message : JSON.stringify(message);
        // Multicast message to all connected dashboard sessions
        for (const client of this.dashboardClients.keys()) {
            if (client.readyState === client.OPEN) {
                client.send(msgStr);
            }
        }
    }

    /**
     * Sends to every dashboard session of one user -- for what only that user's view
     * depends on, such as which events they have seen. Other users' sessions get nothing.
     */
    static sendToUser(userId: number, message: unknown) {
        const msgStr =
            typeof message === "string" ? message : JSON.stringify(message);
        for (const [client, owner] of this.dashboardClients) {
            if (owner === userId && client.readyState === client.OPEN) {
                client.send(msgStr);
            }
        }
    }

    /**
     * Sends a one-way message to a client agent without waiting for a response.
     * Primarily used for 'fire-and-forget' manual triggers (e.g. starting a backup).
     */
    static sendFireAndForget(clientId: string, type: string, payload: unknown) {
        const socket = this.connectedClients.get(clientId);
        if (!socket) throw new Error("Client not connected");
        socket.send(JSON.stringify({ type, payload }));
    }

    /**
     * Called by WebSocketController when a DOCKER_UPDATE message arrives from an agent.
     * Persists the state and broadcasts it to all connected dashboard clients.
     *
     * Checked first for the fields the server reads: the state is stored and later iterated
     * by the update checks and the auto-updater, where a missing repoTags array used to be a
     * TypeError in a scheduler rather than a rejected message.
     */
    static handleDockerUpdate(clientId: string, payload: unknown) {
        const parsed = DockerUpdatePayloadSchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn(
                { clientId, error: firstIssue(parsed.error) },
                "Discarding malformed DOCKER_UPDATE from agent",
            );
            return;
        }
        // The schema checks what the server relies on and lets the rest through, so the
        // full shape is the agent's DockerState as it always was.
        const state = parsed.data as unknown as Omit<DockerState, "updatedAt">;
        const saved = DockerStateService.update(clientId, state);
        this.broadcastToDashboard({
            type: WS_EVENTS.DOCKER_STATE_UPDATE,
            payload: { clientId, state: saved },
        });
    }

    /**
     * Sends a Docker action to an agent and resolves with its DOCKER_ACTION_RESULT.
     *
     * Rejects with a DockerActionError whose `reason` says what went wrong: the agent was
     * not connected, its socket closed before it answered, or it did not answer in time.
     *
     * `onActionId` receives the id this action is filed under, for the caller that reports
     * the request as an activity event -- the agent stamps the same id on everything the
     * action causes, which is what groups them without anyone having to guess.
     */
    static requestDockerAction(
        clientId: string,
        action: Omit<DockerAction, "actionId">,
        timeoutMs = DOCKER_ACTION_TIMEOUT_MS,
        onActionId?: (actionId: string) => void,
    ): Promise<DockerActionResult> {
        const socket = this.connectedClients.get(clientId);
        if (!socket || socket.readyState !== socket.OPEN) {
            return Promise.reject(
                new DockerActionError("not-connected", "Client is not connected"),
            );
        }

        const actionId = randomUUID();
        // Handed out before the action goes on the wire: it is the correlationId the agent
        // will stamp on every event this action causes, and the caller records it as the
        // head of that group. Announcing it afterwards would race the first event back.
        onActionId?.(actionId);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingActions.delete(actionId);
                reject(
                    new DockerActionError(
                        "timeout",
                        `No result from the client within ${timeoutMs / 1000} s`,
                    ),
                );
            }, timeoutMs);

            this.pendingActions.set(actionId, { clientId, socket, resolve, reject, timer });

            try {
                socket.send(
                    JSON.stringify({
                        type: WS_EVENTS.DOCKER_ACTION,
                        payload: { ...action, actionId },
                    }),
                );
            } catch (e) {
                // A send that throws leaves an entry nobody will ever answer.
                clearTimeout(timer);
                this.pendingActions.delete(actionId);
                reject(
                    new DockerActionError(
                        "disconnected",
                        `Could not send to the client: ${e instanceof Error ? e.message : String(e)}`,
                    ),
                );
            }
        });
    }

    /** Fails every action still waiting for an answer over the given socket. */
    private static failPendingActions(socket: WebSocket): void {
        for (const [actionId, entry] of [...this.pendingActions]) {
            if (entry.socket !== socket) continue;
            this.pendingActions.delete(actionId);
            clearTimeout(entry.timer);
            entry.reject(
                new DockerActionError(
                    "disconnected",
                    "The client disconnected before it reported a result",
                ),
            );
        }
    }

    /**
     * Called when an agent returns a DOCKER_ACTION_RESULT.
     * Resolves any pending waiter and forwards the result to all dashboard clients.
     */
    static handleDockerActionResult(clientId: string, payload: unknown) {
        const parsed = DockerActionResultSchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn(
                { clientId, error: firstIssue(parsed.error) },
                "Discarding malformed DOCKER_ACTION_RESULT from agent",
            );
            return;
        }
        const result: DockerActionResult = parsed.data;
        const pending = this.pendingActions.get(result.actionId);
        // The id is a UUID, so a collision is not a practical concern -- but resolving one
        // client's action with another client's report would be silent and hard to trace.
        if (pending && pending.clientId === clientId) {
            this.pendingActions.delete(result.actionId);
            clearTimeout(pending.timer);
            pending.resolve(result);
        }
        this.broadcastToDashboard({
            type: WS_EVENTS.DOCKER_ACTION_RESULT,
            payload: { clientId, result },
        });
    }
}
