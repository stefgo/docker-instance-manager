import { randomUUID } from "crypto";
import cron, { ScheduledTask } from "node-cron";
import { appConfig } from "../config/AppConfig.js";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { ContainerAutoUpdateRepository } from "../repositories/ContainerAutoUpdateRepository.js";
import { ImageUpdateService } from "./ImageUpdateService.js";
import { ProxyService } from "./ProxyService.js";
import { NotificationService } from "./NotificationService.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { logger } from "../core/logger.js";
import { DockerContainer, DockerImage, WS_EVENTS } from "@dim/shared";

export interface ContainerAutoUpdateSchedulerStatus {
    lastRun: string | null;
    nextRun: string | null;
    isRunning: boolean;
    cronExpression: string;
}

export interface ContainerAutoUpdateRunResult {
    eligible: number;
    updated: number;
    skippedNoUpdate: number;
    skippedDelay: number;
    skippedOffline: number;
    failed: number;
}

export interface EligibleContainer {
    clientId: string;
    containerId: string;
    name: string;
    image: string;
    repoDigests: string[];
    source: "label" | "manual";
    delayDays: number;
}

let task: ScheduledTask | null = null;
let lastRun: Date | null = null;
let isRunning = false;
let currentCron = "";

function readLabel(): { key: string; value: string | null } | null {
    const raw = (appConfig.settings.container_auto_update_label ?? "").trim();
    if (!raw) return null;
    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) return { key: raw, value: null };
    return { key: raw.slice(0, eqIdx), value: raw.slice(eqIdx + 1) };
}

function readRefreshCheck(): boolean {
    return (appConfig.settings.container_auto_update_refresh_check ?? "true") === "true";
}

function readDelayLabel(): string {
    return (appConfig.settings.container_auto_update_delay_label ?? "").trim();
}

function parseDelayDays(labels: Record<string, string>, labelKey: string): number {
    if (!labelKey || !(labelKey in labels)) return 0;
    const days = parseInt(labels[labelKey], 10);
    return isNaN(days) || days < 0 ? 0 : days;
}

function readCron(): string {
    return (appConfig.settings.container_auto_update_cron ?? "").trim();
}

function matchesLabel(
    container: DockerContainer,
    labelFilter: { key: string; value: string | null } | null,
): boolean {
    if (!labelFilter) return false;
    const labels = container.labels ?? {};
    if (!(labelFilter.key in labels)) return false;
    if (labelFilter.value === null) return true;
    return labels[labelFilter.key] === labelFilter.value;
}

function resolveContainerImage(
    container: DockerContainer,
    images: DockerImage[],
): { repoTag: string; repoDigests: string[] } | null {
    const configImage = container.configImage ?? container.image;
    const image = images.find((img) => img.repoTags.includes(configImage));
    if (!image) {
        // Fallback: use configImage as repoTag even if we have no digest info
        return { repoTag: configImage, repoDigests: [] };
    }
    return { repoTag: configImage, repoDigests: image.repoDigests };
}

function broadcast() {
    ProxyService.broadcastToDashboard({
        type: WS_EVENTS.SCHEDULER_STATUS_UPDATE,
        payload: {
            containerAutoUpdate: ContainerAutoUpdateSchedulerService.getStatus(),
        },
    });
}

export class ContainerAutoUpdateSchedulerService {
    /**
     * Resolves the current set of eligible containers (label-matched ∪ manual).
     * Returns one entry per (clientId, containerId). If a container appears in
     * both lists, it is reported with source="label" (labels take precedence).
     */
    static getEligibleContainers(): EligibleContainer[] {
        const labelFilter = readLabel();
        const delayLabelKey = readDelayLabel();
        const manualEntries = ContainerAutoUpdateRepository.list();
        const globalNames = new Set(
            manualEntries.filter((e) => e.clientId === "").map((e) => e.containerName),
        );
        const clientKeys = new Set(
            manualEntries.filter((e) => e.clientId !== "").map((e) => `${e.clientId}::${e.containerName}`),
        );

        const states = DockerStateRepository.getAllClientStates();
        const result: EligibleContainer[] = [];
        const seen = new Set<string>();

        for (const { clientId, containers, images } of states) {
            for (const container of containers) {
                const containerName = container.names?.[0]?.replace(/^\//, "") ?? container.id;
                const key = `${clientId}::${container.id}`;
                const byLabel = matchesLabel(container, labelFilter);
                const byManual = globalNames.has(containerName) || clientKeys.has(`${clientId}::${containerName}`);
                if (!byLabel && !byManual) continue;

                const resolved = resolveContainerImage(container, images);
                if (!resolved) continue;

                if (seen.has(key)) continue;
                seen.add(key);

                result.push({
                    clientId,
                    containerId: container.id,
                    name: container.names?.[0]?.replace(/^\//, "") ?? container.id,
                    image: resolved.repoTag,
                    repoDigests: resolved.repoDigests,
                    source: byLabel ? "label" : "manual",
                    delayDays: parseDelayDays(container.labels ?? {}, delayLabelKey),
                });
            }
        }

        return result;
    }

    static validateCron(expression: string): { valid: boolean } {
        const expr = (expression ?? "").trim();
        if (!expr) return { valid: false };
        try {
            return { valid: cron.validate(expr) };
        } catch {
            return { valid: false };
        }
    }

    static async run(): Promise<ContainerAutoUpdateRunResult> {
        if (isRunning) {
            logger.warn("Container auto-update already running, skipping");
            return { eligible: 0, updated: 0, skippedNoUpdate: 0, skippedDelay: 0, skippedOffline: 0, failed: 0 };
        }
        isRunning = true;
        broadcast();

        const result: ContainerAutoUpdateRunResult = {
            eligible: 0,
            updated: 0,
            skippedNoUpdate: 0,
            skippedDelay: 0,
            skippedOffline: 0,
            failed: 0,
        };

        try {
            const eligible = this.getEligibleContainers();
            result.eligible = eligible.length;
            const refreshCheck = readRefreshCheck();

            // Deduplicate image refs — one registry check per unique image
            const uniqueImages = new Map<string, string[]>();
            for (const entry of eligible) {
                if (!uniqueImages.has(entry.image)) {
                    uniqueImages.set(entry.image, entry.repoDigests);
                }
            }

            // Build hasUpdate map keyed by repoTag
            const hasUpdateMap = new Map<string, boolean>();
            const now = new Date().toISOString();

            for (const [repoTag, repoDigests] of uniqueImages) {
                if (refreshCheck) {
                    try {
                        const check = await ImageUpdateService.checkForUpdate(repoTag, repoDigests);
                        DockerStateRepository.updateImageCheckResult(repoTag, {
                            remoteDigest: check.remoteDigest,
                            checkedAt: now,
                            ...(check.error ? { error: check.error } : {}),
                        });
                        hasUpdateMap.set(repoTag, check.hasUpdate);
                    } catch (err) {
                        logger.warn({ err, repoTag }, "Auto-update pre-check failed");
                        hasUpdateMap.set(repoTag, false);
                    }
                } else {
                    // Use cached result: derive hasUpdate from repoDigests vs stored remote digest
                    const refName = repoTag.split(":")[0];
                    const localDigestEntry = repoDigests.find((d) => d.startsWith(refName + "@"));
                    const localDigest = localDigestEntry ? localDigestEntry.split("@")[1] ?? null : null;
                    const remoteDigest = DockerStateRepository.getCachedRemoteDigest(repoTag);
                    const hasUpdate =
                        localDigest !== null && remoteDigest !== null && localDigest !== remoteDigest;
                    hasUpdateMap.set(repoTag, hasUpdate);
                }
            }

            // Cache for manifest creation dates — fetched at most once per image
            const manifestDateCache = new Map<string, Date | null>();

            // Trigger updates per-container where hasUpdate === true
            for (const entry of eligible) {
                const hasUpdate = hasUpdateMap.get(entry.image) === true;
                if (!hasUpdate) {
                    result.skippedNoUpdate++;
                    continue;
                }

                // Per-container delay check via Docker label
                if (entry.delayDays > 0) {
                    if (!manifestDateCache.has(entry.image)) {
                        try {
                            manifestDateCache.set(
                                entry.image,
                                await ImageUpdateService.fetchManifestCreatedDate(entry.image),
                            );
                        } catch {
                            manifestDateCache.set(entry.image, null);
                        }
                    }
                    const createdDate = manifestDateCache.get(entry.image) ?? null;
                    if (createdDate !== null) {
                        const ageMs = Date.now() - createdDate.getTime();
                        if (ageMs < entry.delayDays * 24 * 60 * 60 * 1000) {
                            logger.info(
                                { container: entry.name, image: entry.image, createdDate, delayDays: entry.delayDays },
                                "Auto-update skipped: image too recent",
                            );
                            result.skippedDelay++;
                            continue;
                        }
                    }
                }

                const socket = ProxyService.getClientSocket(entry.clientId);
                if (!socket) {
                    logger.info(
                        { clientId: entry.clientId, container: entry.name },
                        "Auto-update: client offline, skipping",
                    );
                    result.skippedOffline++;
                    continue;
                }

                const actionId = randomUUID();
                const waiter = ProxyService.waitForActionResult(actionId);
                try {
                    ProxyService.sendDockerAction(entry.clientId, {
                        actionId,
                        action: "image:update",
                        target: entry.image,
                    });
                    const actionResult = await waiter;
                    const client = ClientRepository.findById(entry.clientId);
                    const clientName = client?.display_name || client?.hostname || entry.clientId;
                    if (actionResult.success) {
                        result.updated++;
                        logger.info(
                            { clientId: entry.clientId, container: entry.name, image: entry.image },
                            "Auto-update succeeded",
                        );
                        NotificationService.create(
                            "info",
                            `Container ${entry.name} auf ${clientName} automatisch aktualisiert (${entry.image})`,
                            undefined,
                            { clientId: entry.clientId, clientName, containerName: entry.name, imageName: entry.image },
                        );
                    } else {
                        result.failed++;
                        logger.warn(
                            { clientId: entry.clientId, container: entry.name, error: actionResult.error },
                            "Auto-update action failed",
                        );
                        NotificationService.create(
                            "warning",
                            `Auto-Update für Container ${entry.name} auf ${clientName} fehlgeschlagen`,
                            actionResult.error,
                            { clientId: entry.clientId, clientName, containerName: entry.name, imageName: entry.image },
                        );
                    }
                } catch (err) {
                    result.failed++;
                    logger.warn(
                        { err, clientId: entry.clientId, container: entry.name },
                        "Auto-update action errored",
                    );
                    const client = ClientRepository.findById(entry.clientId);
                    const clientName = client?.display_name || client?.hostname || entry.clientId;
                    NotificationService.create(
                        "warning",
                        `Auto-Update für Container ${entry.name} auf ${clientName} fehlgeschlagen (Timeout)`,
                        err instanceof Error ? err.message : String(err),
                        { clientId: entry.clientId, clientName, containerName: entry.name, imageName: entry.image },
                    );
                }
            }

            lastRun = new Date();
            logger.info({ result }, "Container auto-update sweep completed");
            return result;
        } finally {
            isRunning = false;
            broadcast();
        }
    }

    static startScheduler(): void {
        this.stopScheduler();
        const expr = readCron();
        currentCron = expr;
        if (!expr) {
            logger.info("Container auto-update scheduler disabled");
            broadcast();
            return;
        }
        if (!cron.validate(expr)) {
            logger.error({ cron: expr }, "Invalid container auto-update cron expression — scheduler not started");
            broadcast();
            return;
        }
        task = cron.schedule(expr, async () => {
            try {
                await this.run();
            } catch (err) {
                logger.error({ err }, "Container auto-update scheduled run failed");
            }
        });
        logger.info({ cron: expr }, "Container auto-update scheduler started");
        broadcast();
    }

    static stopScheduler(): void {
        if (task) {
            task.stop();
            task = null;
        }
        currentCron = "";
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): ContainerAutoUpdateSchedulerStatus {
        return {
            lastRun: lastRun?.toISOString() ?? null,
            nextRun: null,
            isRunning,
            cronExpression: currentCron,
        };
    }
}
