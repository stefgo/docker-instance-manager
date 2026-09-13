import {
    AGENT_CAPABILITIES,
    AutoUpdatePolicy,
    AutoUpdatePolicyProject,
    WS_EVENTS,
} from "@dim/shared";
import { logger } from "@dim/shared/node";
import { appConfig } from "../config/AppConfig.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { ProxyService } from "./ProxyService.js";

/**
 * The label that enrols a container, as `key` and the value it has to carry. A setting
 * without an `=` names the key alone: its presence is then enough. An empty setting means
 * there is no label route at all -- and no key to write the opt-out on either.
 */
export function readAutoUpdateLabel(): { key: string; value: string | null } | null {
    const raw = (appConfig.settings.container_auto_update_label ?? "").trim();
    if (!raw) return null;
    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) return { key: raw, value: null };
    return { key: raw.slice(0, eqIdx), value: raw.slice(eqIdx + 1) };
}

/** The label holding a per-container delay in days. Empty means no delay is honoured. */
export function readDelayLabelKey(): string {
    return (appConfig.settings.container_auto_update_delay_label ?? "").trim();
}

/** The fleet-wide default schedule from the settings. Empty means there is none. */
function readDefaultCron(): string {
    return (appConfig.settings.container_auto_update_cron ?? "").trim();
}

/**
 * What the server tells agents about auto-update.
 *
 * The inheritance -- default, then host, then project -- is resolved here and nowhere else.
 * An agent receives plain expressions and never learns the rules, which is what lets it
 * keep running its schedule while the server is unreachable, and what keeps the rules from
 * being reimplemented once per agent version.
 */
export class AutoUpdatePolicyService {
    /**
     * The policy for one host.
     *
     * `hostCron` is the host's own expression, or the default when it inherits. Every
     * project is in the list, including the ones with auto-update off: a container may be
     * enrolled by its label while belonging to a stack, and the stack is what decides when
     * it is updated.
     *
     * A project without an expression of its own follows the host -- unless the host has
     * emptied its schedule, which means "this host takes part through its projects only"
     * and is a statement about what is *outside* them. Inheriting that emptiness would
     * silently switch the projects off too, so those fall back to the default instead.
     */
    static buildFor(clientId: string): AutoUpdatePolicy {
        const label = readAutoUpdateLabel();
        const defaultCron = readDefaultCron();
        const client = ClientRepository.findById(clientId);
        const hostCron = (client?.auto_update_cron ?? defaultCron).trim();
        const inheritedCron = hostCron || defaultCron;

        const projects: AutoUpdatePolicyProject[] = ProjectRepository.list().map((project) => ({
            name: project.name,
            autoUpdate: project.autoUpdate,
            cron: (project.cron ?? inheritedCron).trim(),
        }));

        return {
            updatedAt: new Date().toISOString(),
            labelKey: label?.key ?? "",
            labelValue: label?.value ?? null,
            delayLabelKey: readDelayLabelKey(),
            hostCron,
            projects,
        };
    }

    /**
     * Sends the current policy to one agent, if it is connected and says it can act on one.
     * An agent without the capability is left alone: it would store a policy it never reads,
     * and its containers are still managed from here.
     */
    static sendTo(clientId: string): void {
        if (!ProxyService.hasCapability(clientId, AGENT_CAPABILITIES.AUTO_UPDATE)) return;
        try {
            ProxyService.sendFireAndForget(
                clientId,
                WS_EVENTS.AUTO_UPDATE_POLICY,
                this.buildFor(clientId),
            );
        } catch (err) {
            // Not an error worth raising: the agent has just gone away and will be sent the
            // policy again as soon as it authenticates.
            logger.debug({ err, clientId }, "Could not send the auto-update policy");
        }
    }

    /**
     * Sends it to every connected agent. Called after a change that reaches more than one
     * host -- a setting, or any change to a project, which is global by definition.
     */
    static broadcast(): void {
        for (const clientId of ProxyService.getConnectedClientIds()) {
            this.sendTo(clientId);
        }
    }
}
