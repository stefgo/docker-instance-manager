/**
 * The names an agent files its auto-update schedules under: one for everything on the host
 * that belongs to no project, one per project. The agent plans and reports by them, and the
 * dashboard finds a container's next run by the same name -- so both build it here.
 */
export const HOST_SCHEDULE = "host";

export function projectScheduleKey(projectId: string): string {
    return `project:${projectId}`;
}
