import {
    formatPlatform,
    type ActivityRecord,
    type ClientImageUpdateCheck,
    type DockerImage,
    type DockerState,
    type SchedulerStatuses,
    type SchedulerStatusUpdate,
} from "@dim/shared";

/**
 * What a dashboard message or an answer makes of a cache entry: `(what is cached, what
 * arrived) => what is cached now`. Pure, so every rule here is tested without a socket or a
 * component -- `WebSocketProvider` and the queries only decide which entry it belongs to.
 */

// ── Docker state ─────────────────────────────────────────────────────────────

/** The image the new state holds in place of `img`: the same tag on the same platform. */
function predecessorOf(img: DockerImage, previous: DockerState): DockerImage | undefined {
    // Another platform is another image, whatever the tag says.
    return previous.images.find(
        (e) =>
            formatPlatform(e.platform) === formatPlatform(img.platform) &&
            e.repoTags.some((t) => img.repoTags.includes(t)),
    );
}

/**
 * A host's new state, with the update checks the cached one knows and the new one lacks.
 *
 * The server attaches an answer to an image only while it has one stored for exactly that
 * local digest. A snapshot that arrives between a check and its storing, or right after a
 * pull, comes without -- and the column would fall back to "unchecked" until the next
 * sweep. Three cases, per image that arrives without an answer:
 *
 * - its digest is the one the registry was said to hold: the pull went through, and the
 *   image is current as of `now`;
 * - its digests are unchanged: the cached answer still speaks about this image;
 * - its digests changed to something else: the answer was about another image, and is
 *   dropped.
 *
 * This used to be written out twice, once for a state from the socket and once for one
 * that was fetched, and the two had drifted apart in their comments already.
 */
export function carryUpdateChecks(previous: DockerState | undefined, next: DockerState, now: string): DockerState {
    if (!previous) return next;
    let changed = false;
    const images = next.images.map((img) => {
        if (img.updateCheck) return img;
        const prev = predecessorOf(img, previous);
        if (!prev?.updateCheck) return img;

        const localDigest = img.repoDigests[0]?.split("@")[1] ?? null;
        if (localDigest && localDigest === prev.updateCheck.remoteDigest) {
            changed = true;
            return { ...img, updateCheck: { ...prev.updateCheck, hasUpdate: false, checkedAt: now } };
        }
        if (img.repoDigests.join() !== prev.repoDigests.join()) return img;
        changed = true;
        return { ...img, updateCheck: prev.updateCheck };
    });
    return changed ? { ...next, images } : next;
}

/** Which images a check was asked about: by digest where it named any, by tag otherwise. */
export interface ImageCheckTarget {
    imageRef: string;
    repoDigests: string[];
}

/**
 * One client's answer to an update check, written onto its own copy of the image.
 *
 * The same tag is another image on another platform, so the answer goes to the images of
 * the platform it was given for and to no other. Returns the state itself when nothing in
 * it was asked about, so a cache entry is not replaced for nothing.
 */
export function applyImageCheck(
    state: DockerState,
    target: ImageCheckTarget,
    result: ClientImageUpdateCheck,
    checkedAt: string,
): DockerState {
    const platform = formatPlatform(result.platform);
    let changed = false;
    const images = state.images.map((img) => {
        const asked =
            target.repoDigests.length > 0
                ? target.repoDigests.some((d) => img.repoDigests.includes(d))
                : img.repoTags.includes(target.imageRef);
        if (!asked || formatPlatform(img.platform) !== platform) return img;
        changed = true;
        return {
            ...img,
            updateCheck: {
                hasUpdate: result.hasUpdate,
                remoteDigest: result.remoteDigest,
                checkedAt,
                ...(result.error ? { error: result.error } : {}),
            },
        };
    });
    return changed ? { ...state, images } : state;
}

/**
 * Of a fetched state and the cached one, the one to keep: whichever the host reported
 * later. A fetch that was under way while the socket delivered a newer state must not put
 * the older one back.
 */
export function newerState(cached: DockerState | undefined, fetched: DockerState): DockerState {
    return cached && cached.updatedAt > fetched.updatedAt ? cached : fetched;
}

// ── Activity ─────────────────────────────────────────────────────────────────

/**
 * Merges `ACTIVITY_APPENDED` into the list: ids already there are skipped, and the list
 * stays newest first by `occurredAt` -- an event handed over after an offline stretch
 * lands where it happened, not on top. Returns the list itself when nothing is new.
 */
export function appendActivity(events: ActivityRecord[], incoming: ActivityRecord[]): ActivityRecord[] {
    const known = new Set(events.map((e) => e.id));
    const fresh = incoming.filter((e) => !known.has(e.id));
    if (fresh.length === 0) return events;
    return [...fresh, ...events].sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
    );
}

/**
 * Turns the events named seen. Returns the list itself when none of them was unseen --
 * `ACTIVITY_SEEN` arrives for this tab's own marking too, where it changes nothing.
 */
export function markActivitySeen(events: ActivityRecord[], ids: readonly string[]): ActivityRecord[] {
    const seen = new Set(ids);
    if (!events.some((e) => !e.seen && seen.has(e.id))) return events;
    return events.map((e) => (!e.seen && seen.has(e.id) ? { ...e, seen: true } : e));
}

/** The ids among `ids` that are in the list and not seen yet: what a marking will change. */
export function unseenAmong(events: ActivityRecord[], ids: readonly string[]): string[] {
    const asked = new Set(ids);
    return events.filter((e) => !e.seen && asked.has(e.id)).map((e) => e.id);
}

/**
 * Takes a marking back, for exactly the events it had turned seen: the request failed, the
 * server sent nothing, and the list must not claim a state the server does not have.
 */
export function unmarkActivitySeen(events: ActivityRecord[], ids: readonly string[]): ActivityRecord[] {
    const marked = new Set(ids);
    if (!events.some((e) => marked.has(e.id))) return events;
    return events.map((e) => (marked.has(e.id) ? { ...e, seen: false } : e));
}

// ── Schedulers ───────────────────────────────────────────────────────────────

/** `SCHEDULER_STATUS_UPDATE` carries one scheduler at a time; the others stay as they are. */
export function applySchedulerUpdate(schedulers: SchedulerStatuses, update: SchedulerStatusUpdate): SchedulerStatuses {
    return { ...schedulers, [update.scheduler]: update.status };
}
