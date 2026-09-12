import { NotificationLevel, NotificationStep } from "@dim/shared";
import { DockerStateRepository } from "../repositories/DockerStateRepository.js";
import { NotificationService } from "./NotificationService.js";
import { logger } from "@dim/shared/node";

/**
 * A "Pull & Recreate" (`image:update`) reports from two independent sides: the action
 * result comes back over the agent connection, while the agent also pushes a fresh Docker
 * state for every container event the recreate causes -- the state diff in
 * DockerStateService then sees the old container gone, a new one started and a new image
 * behind it. Reported on their own, one update per client fills the notification list with
 * four entries.
 *
 * A group collects those reports for the duration of one operation: the caller opens it
 * before sending the action, the state diff hands its findings to `addStep` instead of
 * creating notifications of its own, and the caller creates a single notification carrying
 * the collected steps once the action reports back.
 *
 * The state is in memory only: a group lives for seconds, and an operation that a restart
 * interrupts has no result to report anyway.
 */

/**
 * How long a group stays open after its notification was created. Container events reach
 * the server over the agent's event stream, so the last of them can arrive after the
 * action result has already been answered.
 */
const GROUP_GRACE_MS = 20_000;

interface Group {
    clientId: string;
    /** Names of the containers this operation is expected to touch. */
    containerNames: Set<string>;
    steps: NotificationStep[];
    /** Set once the operation reported its result and the notification exists. */
    notificationId: string | null;
    timer: NodeJS.Timeout | null;
}

const groups = new Map<string, Group>();

function keyOf(clientId: string, imageRef: string): string {
    return `${clientId}::${imageRef}`;
}

function step(level: NotificationLevel, message: string): NotificationStep {
    return { at: new Date().toISOString(), level, message };
}

function close(key: string): void {
    const group = groups.get(key);
    if (!group) return;
    if (group.timer) clearTimeout(group.timer);
    groups.delete(key);
}

/**
 * Names of the containers that currently run the given image on that client. Read from
 * the last known state, because after the pull the tag has moved and the containers are
 * gone -- the names have to be known before the operation starts.
 */
function affectedContainerNames(clientId: string, imageRef: string): string[] {
    const state = DockerStateRepository.findByClientId(clientId);
    if (!state) return [];
    return state.containers
        .filter((c) => c.image === imageRef || c.configImage === imageRef)
        .map((c) => c.names?.[0]?.replace(/^\//, "") ?? c.id);
}

export class NotificationGroupService {
    /**
     * Opens a group for one image update on one client. Any group still open for the same
     * client and image is dropped -- a second update supersedes the first.
     */
    static begin(clientId: string, imageRef: string, firstStep: string): void {
        const key = keyOf(clientId, imageRef);
        close(key);
        groups.set(key, {
            clientId,
            containerNames: new Set(affectedContainerNames(clientId, imageRef)),
            steps: [step("info", firstStep)],
            notificationId: null,
            timer: setTimeout(() => close(key), GROUP_GRACE_MS),
        });
    }

    /**
     * Offers a container change to the open groups. Returns true if a group took it, in
     * which case the caller must not create a notification for it.
     */
    static addStep(
        clientId: string,
        containerName: string,
        level: NotificationLevel,
        message: string,
    ): boolean {
        for (const [key, group] of groups) {
            if (group.clientId !== clientId) continue;
            if (!group.containerNames.has(containerName)) continue;
            const entry = step(level, message);
            if (group.notificationId) {
                // The notification is already out; grow it in place. If it is gone -- a
                // user deleted it -- the group has nothing left to report.
                if (!NotificationService.appendSteps(group.notificationId, [entry])) {
                    close(key);
                }
            } else {
                group.steps.push(entry);
            }
            return true;
        }
        return false;
    }

    /**
     * Returns the steps collected so far, for the notification the caller is about to
     * create. The group stays open for `attach`.
     */
    static finish(clientId: string, imageRef: string, lastStep?: string): NotificationStep[] {
        const group = groups.get(keyOf(clientId, imageRef));
        if (!group) return [];
        if (lastStep) group.steps.push(step("info", lastStep));
        return [...group.steps];
    }

    /**
     * Binds the group to the notification created from `finish`, so late container events
     * are appended to it for the length of the grace window.
     */
    static attach(clientId: string, imageRef: string, notificationId: string): void {
        const key = keyOf(clientId, imageRef);
        const group = groups.get(key);
        if (!group) {
            logger.debug({ clientId, imageRef }, "No open notification group to attach to");
            return;
        }
        group.notificationId = notificationId;
        group.steps = [];
        if (group.timer) clearTimeout(group.timer);
        group.timer = setTimeout(() => close(key), GROUP_GRACE_MS);
    }

    /** Drops a group without reporting, e.g. when the action never reached the client. */
    static abandon(clientId: string, imageRef: string): void {
        close(keyOf(clientId, imageRef));
    }
}
