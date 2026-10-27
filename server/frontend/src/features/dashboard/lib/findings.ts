import {
    buildFindings as buildSharedFindings,
    type Finding as SharedFinding,
    type FindingTarget,
    type FindingsInput,
    type FleetStatus,
} from "@dim/shared";
import { ROUTES, paths } from "../../../lib/paths";
import { humanDuration, plural } from "../../../utils";

/**
 * What needs a look across the fleet right now, as the overview's "Needs attention" lists it.
 *
 * A finding is a state, not an event: it is there while the problem is, and goes by itself
 * once it is solved -- there is nothing to mark seen. That is what tells it from an error in
 * the activity, which records that something happened and stays until somebody has looked.
 * Everything is read from what the cache already holds and the socket keeps current.
 *
 * Which findings there are is decided in `shared` (`buildFindings`), where the server's status
 * report reads them too; this module only turns where each leads into a link.
 */

export {
    fleetStatus,
    type FindingSeverity,
    type FindingType,
    type FindingsInput,
    type FleetStatus,
} from "@dim/shared";

/** A finding as the overview lists it: with a link to where the reader can do something about it. */
export interface Finding extends Omit<SharedFinding, "target"> {
    to?: string;
}

/** The page a finding's target names. */
function linkTo(target: FindingTarget): string {
    switch (target.kind) {
        case "client":
            return paths.client(target.clientId);
        case "container":
            return paths.containerInstance(target.clientId, target.name);
        case "settings":
            return ROUTES.settings;
    }
}

/** The findings with links in place of targets. */
export function withLinks(findings: readonly SharedFinding[]): Finding[] {
    return findings.map(({ target, ...finding }) => (target ? { ...finding, to: linkTo(target) } : finding));
}

/** Everything that needs a look, as `shared` finds it, each with its link. */
export const buildFindings = (input: FindingsInput): Finding[] => withLinks(buildSharedFindings(input));

export const FLEET_STATUS: Record<FleetStatus, { label: string; description: string; tone: string }> = {
    healthy: { label: "Healthy", description: "Nothing needs attention.", tone: "text-success" },
    degraded: { label: "Degraded", description: "Something needs a look.", tone: "text-warning" },
    critical: { label: "Critical", description: "Something is broken.", tone: "text-error" },
    unknown: { label: "Unknown", description: "No client is registered yet.", tone: "text-text-muted" },
};

/** "3 findings", or what the status means where there is none. */
export function findingSummary(findings: readonly Finding[], status: FleetStatus): string {
    return findings.length > 0 ? plural(findings.length, "finding") : FLEET_STATUS[status].description;
}

/** How long a finding has lasted, in a few words under it; null where that is not known. */
export function findingAge(finding: Pick<Finding, "since">, now: number): string | null {
    const since = finding.since ? Date.parse(finding.since) : NaN;
    if (Number.isNaN(since)) return null;
    return `For ${humanDuration(now - since).toLowerCase()}`;
}
