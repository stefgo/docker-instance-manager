import {
    buildFindings,
    clientCount,
    countFindings,
    fleetStatus,
    projectAssignment,
    type DockerState,
    type StatusReport,
} from "@dim/shared";
import { appVersion } from "../core/version.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ContainerUpdateService } from "./ContainerUpdateService.js";
import { ImageUpdateCheckSchedulerService } from "./ImageUpdateCheckSchedulerService.js";
import { ProjectService } from "./ProjectService.js";
import { ProxyService } from "./ProxyService.js";

/**
 * The status report of `GET /api/v1/status`: how the fleet is doing and what needs a look,
 * as the overview shows it.
 *
 * Nothing is judged here. The inputs are what the overview reads -- the clients with their
 * connection, the Docker state each agent last reported, the projects, the update history
 * and the registries of the update check -- and the verdict and the findings come from the
 * functions in `shared` the overview calls, so the two cannot disagree.
 */
export class StatusService {
    static report(now = Date.now()): StatusReport {
        const clients = ProxyService.getClientsWithStatus();
        const known = new Set(clients.map((client) => client.id));
        // As the overview holds them: one per client in the list, none of a client deleted since.
        const dockerStates: Record<string, Pick<DockerState, "containers">> = {};
        for (const state of DockerStateRepository.getAllClientStates()) {
            if (known.has(state.clientId)) dockerStates[state.clientId] = { containers: state.containers };
        }
        const assignment = projectAssignment(ProjectService.hostStates(), ProjectService.listWithMembers());
        const found = buildFindings({
            clients,
            dockerStates,
            assignment,
            updates: ContainerUpdateService.list(),
            registries: ImageUpdateCheckSchedulerService.getStatus().registries,
            now,
        });
        const findings = found.map((finding) => ({
            id: finding.id,
            type: finding.type,
            severity: finding.severity,
            text: finding.text,
            since: finding.since ?? null,
        }));
        return {
            app: "dim",
            version: appVersion,
            status: fleetStatus(findings, clients),
            checkedAt: new Date(now).toISOString(),
            counts: countFindings(findings),
            summary: { clients: clientCount(clients) },
            findings,
        };
    }
}
