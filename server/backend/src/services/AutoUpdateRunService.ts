import { AGENT_CAPABILITIES, WS_EVENTS } from "@dim/shared";
import { logger } from "@dim/shared/node";
// The two services refer to each other: this one records what the server observes about an
// agent, and ActivityService hands the checks an agent reported back to it. Both only ever
// touch the other inside a method, long after either module has finished evaluating.
import { ActivityService } from "./ActivityService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ProxyService } from "./ProxyService.js";

/** The registry answers one run carried, in the shape `autoupdate.run` reports them. */
interface ReportedCheck {
    imageRef: string;
    remoteDigest: string | null;
    checkedAt: string;
    error?: string;
}

function readChecks(data: Record<string, unknown> | null | undefined): ReportedCheck[] {
    const raw = data?.checks;
    if (!Array.isArray(raw)) return [];
    const checks: ReportedCheck[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const check = entry as Record<string, unknown>;
        if (typeof check.imageRef !== "string" || !check.imageRef) continue;
        if (typeof check.checkedAt !== "string" || !check.checkedAt) continue;
        checks.push({
            imageRef: check.imageRef,
            remoteDigest: typeof check.remoteDigest === "string" ? check.remoteDigest : null,
            checkedAt: check.checkedAt,
            ...(typeof check.error === "string" && check.error ? { error: check.error } : {}),
        });
    }
    return checks;
}

/**
 * The server's half of an auto-update it no longer performs: it configures the agents and
 * asks one of them to run, and it keeps what a run reported about the registries.
 *
 * The sweep that used to live here is gone. It resolved eligibility from stored snapshots,
 * asked the registries on the agents' behalf and then sent one action per container -- all
 * of which the host itself can answer better, and none of which worked while the host was
 * unreachable.
 *
 * The reading half is gone too, with the fleet view it fed: a `getStatus` that folded the
 * newest `autoupdate.run` per host and schedule into one response. The events it read are
 * still stored and still the only record of who ran when -- the activity shows them, and the
 * client list takes the newest per host from them.
 */
export class AutoUpdateRunService {
    /**
     * Whose ids are already on record as unable to run their own auto-update.
     *
     * Kept in the process rather than in the database: the capability describes the build on
     * the wire, so "has been reported" is only meaningful for as long as the connections are.
     * An agent that is updated and reconnects is simply no longer in the list.
     */
    private static warnedWithoutCapability = new Set<string>();

    /**
     * Writes the registry answers one run carried into `image_update_checks`.
     *
     * The table stays the dashboard's source for the update indicator, and a host that has
     * just asked the registry about its own images knows the answer before the server's own
     * sweep comes round again. Only a newer answer wins, so a batch that arrives late after
     * an offline stretch cannot age the cache.
     */
    static applyReportedChecks(data: Record<string, unknown> | null | undefined): void {
        for (const check of readChecks(data)) {
            try {
                DockerStateRepository.updateImageCheckResultIfNewer(check.imageRef, check);
            } catch (err) {
                logger.warn({ err, imageRef: check.imageRef }, "Could not store a reported image check");
            }
        }
    }

    /**
     * Notes, once per connected agent, that it predates autonomous auto-update.
     *
     * Its connection is accepted regardless: an agent too old to update itself is exactly the
     * one that has to stay manageable, or there is no way to update it at all.
     */
    static reportMissingCapability(clientId: string, version: string | null): void {
        if (ProxyService.hasCapability(clientId, AGENT_CAPABILITIES.AUTO_UPDATE)) {
            this.warnedWithoutCapability.delete(clientId);
            return;
        }
        if (this.warnedWithoutCapability.has(clientId)) return;
        this.warnedWithoutCapability.add(clientId);

        const client = ClientRepository.findById(clientId);
        ActivityService.record({
            kind: "client.autoupdate.unsupported",
            level: "warning",
            clientId,
            data: {
                clientName: client?.display_name || client?.hostname || clientId,
                version,
            },
        });
    }

    /**
     * Asks one agent to run its auto-update now. Returns whether the command went out: an
     * agent that is offline or predates the capability is not an error to raise here, it is
     * the answer to the question.
     *
     * One agent is the only shape this comes in. A fleet-wide `triggerAll` existed as long
     * as the settings page carried a button for it; asking every host at once put a single
     * answer -- "n asked" -- in place of the n reports that actually say what happened, and
     * the command carries no list of containers anyway, so the sweep was never the server's
     * to conduct.
     */
    static trigger(clientId: string): boolean {
        if (!ProxyService.hasCapability(clientId, AGENT_CAPABILITIES.AUTO_UPDATE)) return false;
        try {
            ProxyService.sendFireAndForget(clientId, WS_EVENTS.AUTO_UPDATE_RUN, {});
            logger.info({ clientId }, "Asked an agent to run its auto-update now");
            return true;
        } catch (err) {
            logger.debug({ err, clientId }, "Could not ask an agent to run its auto-update");
            return false;
        }
    }
}
