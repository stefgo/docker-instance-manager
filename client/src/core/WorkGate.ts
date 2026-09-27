import { logger } from "@dim/shared/node";
import { config } from "./Config.js";

/** Refused work: the agent is about to replace its own container, or already doing so. */
export class WorkGateClosedError extends Error {
    constructor() {
        super("Agent is replacing itself -- retry once it has reconnected");
        this.name = "WorkGateClosedError";
    }
}

/**
 * What the agent is doing to Docker right now, so that its self-update does not cut it short.
 *
 * Recreating the agent's own container ends this process, and with it every action and
 * auto-update run that is still under way -- a container another action had just stopped and
 * removed would never be created again. Each of those runs as a unit of work here, and the
 * self-update waits until it is the only thing left.
 *
 * - `open`: work is accepted.
 * - `waiting`: a self-update is waiting for the other units to finish. New work is refused,
 *   so the wait has an end; what was already running carries on.
 * - `replacing`: the helper container has been started and is about to stop this one.
 *   Nothing is accepted any more. If the helper ends and this process is still there, the
 *   helper failed, and the gate opens again.
 *
 * The self-update is always requested from inside a unit -- the action or the run that
 * recreates the agent's container -- so it waits for every unit but its own.
 */
export class WorkGate {
    private static active = 0;
    private static state: "open" | "waiting" | "replacing" = "open";
    /** The self-update under way. A second request joins it rather than starting another. */
    private static pending: Promise<void> | null = null;
    /** How many units are waiting for the self-update, and so do not count as busy. */
    private static parked = 0;
    private static onIdle: (() => void) | null = null;

    /**
     * Enters a unit of work and returns the function that leaves it, or null when the gate is
     * closed. For a caller that has to decide itself what a refusal means.
     */
    static tryEnter(label: string): (() => void) | null {
        if (this.state !== "open") {
            logger.info({ work: label, state: this.state }, "Refusing work while the agent replaces itself");
            return null;
        }
        this.active++;
        let left = false;
        return () => {
            if (left) return;
            left = true;
            this.active--;
            this.checkIdle();
        };
    }

    /** Runs `fn` as a unit of work. Throws `WorkGateClosedError` when the gate is closed. */
    static async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const leave = this.tryEnter(label);
        if (!leave) throw new WorkGateClosedError();
        try {
            return await fn();
        } finally {
            leave();
        }
    }

    /**
     * Replaces this agent's container once nothing else is running. `spawn` starts the helper
     * and hands back a promise that settles when the helper has gone.
     *
     * Resolves once the helper has been started. Rejects when the other work does not finish
     * within `selfUpdateWaitSeconds` or the helper cannot be started; the gate is open again
     * then, and the caller reports the failure as its own.
     */
    static async replaceSelf(spawn: () => Promise<{ exited: Promise<unknown> }>): Promise<void> {
        this.parked++;
        try {
            this.pending ??= this.waitAndSpawn(spawn);
            await this.pending;
        } finally {
            this.parked--;
        }
    }

    private static async waitAndSpawn(spawn: () => Promise<{ exited: Promise<unknown> }>): Promise<void> {
        this.state = "waiting";
        try {
            await this.idle();
            this.state = "replacing";
            logger.info("No other work is running: starting the self-update helper");
            const { exited } = await spawn();
            // On success the helper stops this process before it exits itself, so reaching
            // this callback means it gave up without replacing the agent.
            void exited
                .catch(() => {})
                .then(() => {
                    logger.error("The self-update helper ended without replacing this agent; accepting work again");
                    this.reopen();
                });
        } catch (err) {
            this.reopen();
            throw err;
        }
    }

    /** Resolves once every unit that is not waiting for the self-update has left. */
    private static idle(): Promise<void> {
        const seconds = config.selfUpdateWaitSeconds;
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.onIdle = null;
                reject(new Error(`Self-update abandoned: other work was still running after ${seconds}s`));
            }, seconds * 1000);
            this.onIdle = () => {
                clearTimeout(timer);
                this.onIdle = null;
                resolve();
            };
            if (this.active > this.parked) {
                logger.info(
                    { running: this.active - this.parked, waitSeconds: seconds },
                    "Self-update waits for the agent's other work to finish",
                );
            }
            this.checkIdle();
        });
    }

    private static checkIdle(): void {
        if (this.onIdle && this.active <= this.parked) this.onIdle();
    }

    private static reopen(): void {
        this.state = "open";
        this.pending = null;
    }
}
