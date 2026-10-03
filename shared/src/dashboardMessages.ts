import { z } from "zod";
import { WS_EVENTS } from "./constants.js";
import { DockerActionResultSchema } from "./schemas.js";
import {
    ActivityListSchema,
    AutoUpdateLabelSchema,
    ClientListSchema,
    DockerStateSchema,
    ProjectListResponseSchema,
    SchedulerStatusUpdateSchema,
} from "./responses.js";

/**
 * Every message the server pushes over `/ws/dashboard`, as one discriminated union.
 *
 * The types used to exist twice and nowhere: as a constant or a string literal at each
 * place the backend sent one, and as a chain of `if (data.type === …)` in the dashboard
 * that read the payload unchecked. A message added on one side was simply never handled
 * on the other, and nothing said so.
 *
 * Now both ends hang on this union. The backend's `broadcastToDashboard` takes a
 * `DashboardMessage`, so it cannot send a shape that is not listed here; the dashboard
 * parses against the schema and dispatches in a `switch` that ends in `assertNever`, so a
 * member added here without a case there fails `typecheck`.
 */
export const DashboardMessageSchema = z.discriminatedUnion("type", [
    /** The full list of clients and their statuses; also the first message on connect. */
    z.object({ type: z.literal(WS_EVENTS.CLIENTS_UPDATE), payload: ClientListSchema }),
    /**
     * One host's Docker state: sent for every host on connect, and again whenever an agent
     * reports a new one.
     */
    z.object({
        type: z.literal(WS_EVENTS.DOCKER_STATE_UPDATE),
        payload: z.object({ clientId: z.string(), state: DockerStateSchema }),
    }),
    /**
     * What an agent answered to a Docker action. The request that asked for the action gets
     * the same result as its own answer; this copy goes to every dashboard.
     */
    z.object({
        type: z.literal(WS_EVENTS.DOCKER_ACTION_RESULT),
        payload: z.object({ clientId: z.string(), result: DockerActionResultSchema }),
    }),
    /** One server scheduler, whenever a run starts or ends or its timer moves. */
    z.object({ type: z.literal(WS_EVENTS.SCHEDULER_STATUS_UPDATE), payload: SchedulerStatusUpdateSchema }),
    /** The auto-update label as configured, when the settings change it. */
    z.object({ type: z.literal(WS_EVENTS.AUTO_UPDATE_LABEL_UPDATE), payload: AutoUpdateLabelSchema }),
    /** Every managed project with its counts, after a project was added, changed or removed. */
    z.object({ type: z.literal(WS_EVENTS.PROJECTS_UPDATE), payload: ProjectListResponseSchema }),
    /** The whole activity list: on connect, with this user's seen state, and empty after "Delete all". */
    z.object({ type: z.literal(WS_EVENTS.ACTIVITY_UPDATE), payload: ActivityListSchema }),
    /** Events stored for the first time, to be merged into the list by id. */
    z.object({ type: z.literal(WS_EVENTS.ACTIVITY_APPENDED), payload: ActivityListSchema }),
    /** The events the session's user has just marked seen. Sent to that user's sessions only. */
    z.object({
        type: z.literal(WS_EVENTS.ACTIVITY_SEEN),
        payload: z.object({ ids: z.array(z.string()) }),
    }),
]);

export type DashboardMessage = z.infer<typeof DashboardMessageSchema>;
export type DashboardMessageType = DashboardMessage["type"];
