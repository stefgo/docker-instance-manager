import type { DockerHealth } from "@dim/shared";
import { formatDate } from "../../../utils";
import type { OfflineNotice } from "./offlineNotice";

/**
 * What the page of a connected client says while its agent cannot reach the Docker daemon,
 * or `null` while it can (or has not said yet).
 *
 * The lists stay: they are the last state that was read and the only picture there is. The
 * notice says how old that picture is, so it is not read as current, and why actions on it
 * will fail.
 */
export function dockerNotice(
    { docker, dockerStateAt }: { docker?: DockerHealth | null; dockerStateAt?: string | null },
    locale?: string,
): OfflineNotice | null {
    if (!docker || docker.reachable) return null;
    return {
        title: `The agent cannot reach Docker, since ${formatDate(docker.since, { locale })}`,
        lines: [
            ...(docker.error ? [docker.error] : []),
            dockerStateAt
                ? `The lists show the last state that was read, from ${formatDate(dockerStateAt, { locale })}.`
                : "No Docker state has been read yet.",
            "Actions on this host fail until Docker is reachable again.",
        ],
    };
}
