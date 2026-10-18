import { AGENT_CAPABILITIES, ImageChecksSchema, WS_EVENTS, firstIssue } from "@dim/shared";
import { logger } from "@dim/shared/node";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ProxyService } from "./ProxyService.js";

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
 * newest `autoupdate.run` per host and schedule into one response. When a host last ran and
 * will next run, it reports itself (`AGENT_STATUS`); the events are the activity's record of
 * what a run did.
 */
export class AutoUpdateRunService {
    /**
     * Takes an agent's `IMAGE_CHECKS` -- the registry answers of the last run of each of its
     * schedules -- into `image_update_checks`.
     *
     * The table stays the dashboard's source for the update indicator, and a host that has
     * just asked the registry about its own images knows the answer before the server's own
     * sweep comes round again. Only a newer answer wins, so the same answers sent again on
     * the next connect, or a report that arrives late, cannot age the cache.
     */
    static handleImageChecks(clientId: string, payload: unknown): void {
        const parsed = ImageChecksSchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn(
                { clientId, error: firstIssue(parsed.error) },
                "Discarding malformed IMAGE_CHECKS from agent",
            );
            return;
        }
        for (const check of parsed.data.checks) {
            try {
                DockerStateRepository.updateImageCheckResultIfNewer(check);
            } catch (err) {
                logger.warn({ err, imageRef: check.imageRef }, "Could not store a reported image check");
            }
        }
    }

    /**
     * Asks one agent to run its auto-update now. Returns whether the command went out: an
     * agent that is offline or does not declare the capability is not an error to raise
     * here, it is the answer to the question.
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
            ProxyService.sendToAgent(clientId, WS_EVENTS.AUTO_UPDATE_RUN, {});
            logger.info({ clientId }, "Asked an agent to run its auto-update now");
            return true;
        } catch (err) {
            logger.debug({ err, clientId }, "Could not ask an agent to run its auto-update");
            return false;
        }
    }
}
