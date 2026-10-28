import { randomUUID } from "crypto";
import cron, { ScheduledTask } from "node-cron";
import type { AgentStatus } from "@dim/shared";
import { logger } from "@dim/shared/node";
import { readJsonFile, writeJsonFile } from "../core/DataStore.js";
import { PruneState, pruneSummary, readPruneState } from "./AutoPruneState.js";
import { AutoUpdateService } from "./AutoUpdateService.js";
import { DockerService } from "./DockerService.js";
import { PolicyService } from "./PolicyService.js";

/** Where the auto-prune keeps what it has to survive a restart. */
const STATE_FILE = "prune-state.json";

/**
 * Runs `docker system prune` on this host on the schedule the server sends with the policy
 * (`pruneCron`), on the host's own clock -- a server that is down at four in the morning
 * costs nothing but the reporting.
 *
 * The prune is the same action the dashboard's Prune sends, run through `DockerService`, so
 * it removes the same things and reports the same events, marked as an auto-prune. A run
 * that was missed while the agent was down is not made up: the next date clears up the same.
 */
export class AutoPruneService {
    private static task: ScheduledTask | null = null;
    private static state: PruneState = readPruneState(null);
    private static runningSince: string | null = null;
    private static started = false;
    private static changeListeners: Array<() => void> = [];

    /** Where the auto-prune stands, for `AGENT_STATUS`. */
    static summary(): NonNullable<AgentStatus["autoPrune"]> {
        return pruneSummary(this.state, this.runningSince);
    }

    /** Registers a listener for a change in what `summary` reads. */
    static onStateChange(listener: () => void): void {
        this.changeListeners.push(listener);
    }

    /**
     * Plans the schedule from the stored policy and plans it anew whenever another arrives.
     * Called once at start, before any connection, like the auto-update.
     */
    static start(): void {
        if (this.started) return;
        this.started = true;
        this.state = readPruneState(readJsonFile(STATE_FILE));
        PolicyService.subscribe(() => this.plan());
        this.plan();
    }

    private static plan(): void {
        this.task?.stop();
        this.task = null;

        const expression = (PolicyService.get()?.pruneCron ?? "").trim();
        if (expression && !cron.validate(expression)) {
            logger.error({ cron: expression }, "Ignoring an auto-prune schedule with an invalid cron expression");
        } else if (expression) {
            this.task = cron.schedule(expression, () => void this.run());
            logger.info({ cron: expression }, "Auto-prune schedule planned");
        } else if (this.state.cron) {
            logger.info("Auto-prune switched off");
        }

        this.save({ cron: this.task ? expression : "", nextRun: this.nextRun() });
    }

    /**
     * One prune. Queued behind a running auto-update: a container that run is recreating
     * exists for a moment without having been started, and the prune would remove it.
     */
    private static async run(): Promise<void> {
        if (this.runningSince) {
            logger.warn("Skipping an auto-prune while the last one is still under way");
            return;
        }
        this.runningSince = new Date().toISOString();
        this.notifyChange();
        try {
            await AutoUpdateService.exclusive(async () => {
                logger.info("Auto-prune started");
                const result = await DockerService.executeAction(
                    { actionId: randomUUID(), action: "system:prune", target: "" },
                    { trigger: "auto", data: { autoPrune: true } },
                );
                if (!result.success) logger.warn({ error: result.error }, "Auto-prune failed");
            });
        } catch (err) {
            logger.error({ err }, "Auto-prune failed");
        } finally {
            this.runningSince = null;
            this.save({ lastRun: new Date().toISOString(), nextRun: this.nextRun() });
        }
    }

    private static nextRun(): string | null {
        return this.task?.getNextRun()?.toISOString() ?? null;
    }

    private static save(patch: Partial<PruneState>): void {
        this.state = { ...this.state, ...patch };
        writeJsonFile(STATE_FILE, this.state);
        this.notifyChange();
    }

    private static notifyChange(): void {
        for (const listener of this.changeListeners) {
            try {
                listener();
            } catch (err) {
                logger.error({ err }, "An auto-prune state listener failed");
            }
        }
    }
}
