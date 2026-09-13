import { AutoUpdatePolicy, AutoUpdatePolicySchema, firstIssue } from "@dim/shared";
import { logger } from "@dim/shared/node";
import { readJsonFile, writeJsonFile } from "../core/DataStore.js";

const POLICY_FILE = "policy.json";

/**
 * The auto-update policy, as the server last sent it.
 *
 * It belongs to the server: it arrives whole and is replaced whole, and the agent has no
 * local override for any of it -- DIM is where auto-update is configured, and a value that
 * could be changed on the host would make the dashboard lie about what the fleet does.
 *
 * It is kept on disk so an agent that comes up without a server still knows what it is
 * supposed to do. Every schedule in it is already resolved, so nothing here has to know
 * about defaults, hosts or inheritance.
 */
export class PolicyService {
    private static policy: AutoUpdatePolicy | null = null;
    private static loaded = false;

    /** The current policy, read from disk on first access. `null` if none has arrived yet. */
    static get(): AutoUpdatePolicy | null {
        if (!this.loaded) {
            this.loaded = true;
            const stored = readJsonFile(POLICY_FILE);
            if (stored !== null) {
                const parsed = AutoUpdatePolicySchema.safeParse(stored);
                if (parsed.success) {
                    this.policy = parsed.data;
                    logger.info(
                        { updatedAt: parsed.data.updatedAt },
                        "Loaded the stored auto-update policy",
                    );
                } else {
                    // Written by a build that shaped it differently, or damaged. Dropped
                    // rather than repaired: the server sends a fresh one on the next connect.
                    logger.warn(
                        { issue: firstIssue(parsed.error) },
                        "Discarding a stored auto-update policy that does not parse",
                    );
                }
            }
        }
        return this.policy;
    }

    /**
     * Takes the policy from an `AUTO_UPDATE_POLICY` message. Checked before it is stored:
     * this decides when the agent recreates containers on its host, and a malformed message
     * must not become the plan it acts on for the rest of the connection.
     */
    static apply(payload: unknown): void {
        const parsed = AutoUpdatePolicySchema.safeParse(payload);
        if (!parsed.success) {
            logger.warn(
                { issue: firstIssue(parsed.error) },
                "Ignoring a malformed AUTO_UPDATE_POLICY from the server",
            );
            return;
        }

        this.loaded = true;
        this.policy = parsed.data;
        writeJsonFile(POLICY_FILE, parsed.data);
        logger.info(
            {
                updatedAt: parsed.data.updatedAt,
                hostCron: parsed.data.hostCron,
                projects: parsed.data.projects.length,
            },
            "Auto-update policy updated",
        );
    }
}
