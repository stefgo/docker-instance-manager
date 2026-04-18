import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ImageUpdateService } from "./ImageUpdateService.js";
import { ProxyService } from "./ProxyService.js";
import { logger } from "../core/logger.js";
import { WS_EVENTS } from "@dim/shared";

export interface ImageUpdateCheckSchedulerStatus {
    lastRun: string | null;
    nextRun: string | null;
    isRunning: boolean;
}

let timer: NodeJS.Timeout | null = null;
let lastRun: Date | null = null;
let nextRun: Date | null = null;
let isRunning = false;

function readIntervalSeconds(): number {
    const raw = appConfig.settings.image_update_check_interval_seconds ?? "0";
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function broadcast() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.SCHEDULER_STATUS_UPDATE,
        payload: {
            lastRun: lastRun?.toISOString() ?? null,
            nextRun: nextRun?.toISOString() ?? null,
            isRunning,
        },
    });
}

export class ImageUpdateCheckSchedulerService {
    static async run(): Promise<number> {
        if (isRunning) {
            logger.warn("Image update check already running, skipping");
            return 0;
        }
        isRunning = true;
        broadcast();
        try {
            const refs = DockerStateRepository.getAllImageRefs();
            const now = new Date().toISOString();
            let checked = 0;

            for (const { repoTag, repoDigests } of refs) {
                try {
                    const result = await ImageUpdateService.checkForUpdate(repoTag, repoDigests);
                    DockerStateRepository.updateImageCheckResult(repoTag, {
                        remoteDigest: result.remoteDigest,
                        checkedAt: now,
                        ...(result.error ? { error: result.error } : {}),
                    });
                    checked++;
                } catch (err) {
                    logger.error({ err, repoTag }, "Scheduled image update check failed for tag");
                }
            }

            lastRun = new Date();
            logger.info({ checked }, "Scheduled image update check completed");
            return checked;
        } finally {
            isRunning = false;
            broadcast();
        }
    }

    static startScheduler(): void {
        this.stopScheduler();
        const intervalSeconds = readIntervalSeconds();
        if (intervalSeconds <= 0) {
            nextRun = null;
            logger.info("Image update check scheduler disabled");
            return;
        }
        const intervalMs = intervalSeconds * 1000;
        nextRun = new Date(Date.now() + intervalMs);
        broadcast();
        timer = setInterval(async () => {
            try {
                await this.run();
            } catch (err) {
                logger.error({ err }, "Scheduled image update check sweep failed");
            }
            const seconds = readIntervalSeconds();
            nextRun = seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;
            broadcast();
        }, intervalMs);
        timer.unref?.();
        logger.info({ intervalSeconds }, "Image update check scheduler started");
    }

    static stopScheduler(): void {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        nextRun = null;
        broadcast();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): ImageUpdateCheckSchedulerStatus {
        return {
            lastRun: lastRun?.toISOString() ?? null,
            nextRun: nextRun?.toISOString() ?? null,
            isRunning,
        };
    }
}
