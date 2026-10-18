import type { DockerHealth } from "@dim/shared";

/** What one attempt to reach the Docker daemon came to. */
export type DockerOutcome = { ok: true } | { ok: false; error: string };

/**
 * The health after one more attempt. `since` moves only when the answer flips between
 * reachable and not, so it says how long the current one has held; a failure with another
 * message keeps it and only updates the message. An attempt that changes nothing hands back
 * `prev` itself, which lets the caller tell a change by identity.
 */
export function nextDockerHealth(
    prev: DockerHealth | null,
    outcome: DockerOutcome,
    now: Date,
): DockerHealth {
    const reachable = outcome.ok;
    const error = outcome.ok ? null : outcome.error;
    if (prev && prev.reachable === reachable) {
        return prev.error === error ? prev : { ...prev, error };
    }
    return { reachable, error, since: now.toISOString() };
}
