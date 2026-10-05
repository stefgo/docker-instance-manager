import {
    AutoUpdatePolicy,
    AutoUpdatePolicyProject,
    DockerContainer,
    DockerImage,
    ImagePlatform,
    ProjectAssignment,
    resolveAssignment,
} from "@dim/shared";

/**
 * What auto-update decides about one container, as pure functions of the container and the
 * policy: whether it takes part, on which schedule, and which image it is updated to.
 * `AutoUpdateService` does the work; nothing in here touches Docker, the disk or the clock.
 */

/** The schedule for everything on this host that belongs to no project DIM knows. */
export const HOST_SCHEDULE = "host";

/**
 * The project a container belongs to, by the queries the policy carries. Client criteria are
 * matched against the host as the server knows it, so this reaches the same answer the
 * dashboard shows.
 */
export function assignmentOf(
    container: DockerContainer,
    policy: AutoUpdatePolicy,
): ProjectAssignment<AutoUpdatePolicyProject> {
    return resolveAssignment(policy.projects, policy.host, container);
}

/**
 * The opt-out is the configured label carrying `false`, and it beats every other reason to
 * take part -- including a project that is switched on. Without a configured label there is
 * no key to write it on, and so no opt-out either.
 */
export function isOptedOut(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    if (!policy.labelKey) return false;
    const value = container.labels?.[policy.labelKey];
    return typeof value === "string" && value.trim().toLowerCase() === "false";
}

export function matchesLabel(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    if (!policy.labelKey) return false;
    const labels = container.labels ?? {};
    if (!(policy.labelKey in labels)) return false;
    if (policy.labelValue === null) return true;
    return labels[policy.labelKey] === policy.labelValue;
}

export function parseDelayDays(container: DockerContainer, policy: AutoUpdatePolicy): number {
    const key = policy.delayLabelKey;
    if (!key) return 0;
    const raw = container.labels?.[key];
    if (raw === undefined) return 0;
    const days = parseInt(raw, 10);
    return isNaN(days) || days < 0 ? 0 : days;
}

/**
 * The image a container is to be updated to, plus the digests it currently carries. The
 * configured tag is what a recreate has to pull; `image` only says what it happens to run,
 * which after an earlier pull may be a bare sha256 reference.
 */
export function resolveImage(
    container: DockerContainer,
    images: DockerImage[],
): { imageRef: string; repoDigests: string[]; tagImageId: string | null; platform?: ImagePlatform } {
    const imageRef = container.configImage ?? container.image;
    const image = images.find((img) => img.repoTags.includes(imageRef));
    // The platform comes from the image the container runs, which after a pull is no
    // longer the one the tag points to; both are built for the same platform unless
    // somebody pulled the tag for another one.
    const running = images.find((img) => img.id === container.imageId);
    const platform = running?.platform ?? image?.platform;
    return {
        imageRef,
        repoDigests: image?.repoDigests ?? [],
        tagImageId: image?.id ?? null,
        ...(platform ? { platform } : {}),
    };
}

/**
 * Which schedule a container is on. Membership of a project decides this on its own: the
 * source only says *whether* a container takes part, the project says *when* it is updated,
 * so a labelled container inside a project moves with it rather than updating an hour
 * before the database it talks to.
 *
 * A container that matches several projects has no project schedule. Enrolled by its label,
 * it falls back to the host schedule -- if the host has one; otherwise, and without a label,
 * it is on no schedule (`null`) and is not updated.
 */
export function scheduleKeyOf(
    container: DockerContainer,
    assignment: ProjectAssignment<AutoUpdatePolicyProject>,
    policy: AutoUpdatePolicy,
): string | null {
    if (assignment.kind === "project") return projectScheduleKey(assignment.project);
    if (assignment.kind === "none") return HOST_SCHEDULE;
    return hostFallbackOf(container, policy) ? HOST_SCHEDULE : null;
}

/** Whether a conflicting container is updated on the host schedule through its label. */
export function hostFallbackOf(container: DockerContainer, policy: AutoUpdatePolicy): boolean {
    return (
        matchesLabel(container, policy) &&
        !isOptedOut(container, policy) &&
        policy.hostCron.trim().length > 0
    );
}

export function projectScheduleKey(project: AutoUpdatePolicyProject): string {
    return `project:${project.id}`;
}
