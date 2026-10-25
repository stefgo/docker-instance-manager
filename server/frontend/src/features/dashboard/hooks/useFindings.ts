import { useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { useClients } from "../../../queries/clients";
import { useDockerStates } from "../../../queries/docker";
import { useSchedulerStatus } from "../../../queries/scheduler";
import { useUpdateHistory } from "../../../queries/updates";
import { useProjectAssignment } from "../../projects/hooks/useProjectMembers";
import { buildFindings, findingSummary, fleetStatus } from "../lib/findings";

/**
 * The findings of the fleet and the status they add up to. Only reads the cache and calls
 * `buildFindings`; the socket keeps what it reads current, so a finding comes and goes with
 * the host it is about.
 */
export function useFindings() {
    const { clients, isPending } = useClients();
    const dockerStates = useDockerStates();
    const assignment = useProjectAssignment();
    const updates = useUpdateHistory().data;
    const registries = useSchedulerStatus("image-update-check")?.registries;
    const now = useNow();

    return useMemo(() => {
        const findings = buildFindings({ clients, dockerStates, assignment, updates, registries, now });
        const status = isPending ? "unknown" : fleetStatus(findings, clients);
        return { findings, status, summary: isPending ? "Loading…" : findingSummary(findings, status) };
    }, [clients, dockerStates, assignment, updates, registries, now, isPending]);
}
