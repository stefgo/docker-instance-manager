import { type AutoUpdateScheduleRun, HOST_SCHEDULE, projectScheduleKey } from "@dim/shared";
import type { AutoUpdateEnrollment } from "../autoUpdate";

/**
 * The schedule a container is updated on, by the name its agent plans it under -- the
 * agent's `scheduleKeyOf` read off the enrollment the lists already resolve. A project
 * decides on its own: a container inside one moves with it, whether its label or the project
 * enrolled it. A container in conflict is enrolled only where its label takes it to the host
 * schedule (`resolveAutoUpdate`), so it is the host's. One that is not enrolled is on none.
 *
 * When that schedule fires -- the default, the host's expression or the project's -- is not
 * decided here. The server resolves the inheritance into the agent's policy, and the agent
 * reports each schedule it planned with its own next run.
 */
export function scheduleKeyFor(enrollment: AutoUpdateEnrollment): string | null {
    if (enrollment.source === "none") return null;
    if (enrollment.conflict) return HOST_SCHEDULE;
    if (enrollment.projectId !== null) return projectScheduleKey(enrollment.projectId);
    return HOST_SCHEDULE;
}

/**
 * The next run of the schedule a container is on, as the host's agent reported it, or `null`:
 * not enrolled, an agent that has not reported its schedules, or a schedule it did not plan
 * -- a project switched off, an expression it cannot read.
 */
export function nextCheckOf(
    enrollment: AutoUpdateEnrollment,
    schedules: readonly AutoUpdateScheduleRun[] | null | undefined,
): AutoUpdateScheduleRun | null {
    const key = scheduleKeyFor(enrollment);
    if (key === null || !schedules) return null;
    const plan = schedules.find((s) => s.schedule === key);
    return plan?.nextRun ? plan : null;
}

/** The earliest of several -- when the first of a container's hosts is next checked. */
export function earliestNextCheck(
    checks: readonly (AutoUpdateScheduleRun | null)[],
): AutoUpdateScheduleRun | null {
    let earliest: AutoUpdateScheduleRun | null = null;
    let earliestAt = Infinity;
    for (const check of checks) {
        const at = check?.nextRun ? Date.parse(check.nextRun) : NaN;
        if (at < earliestAt) {
            earliest = check;
            earliestAt = at;
        }
    }
    return earliest;
}
