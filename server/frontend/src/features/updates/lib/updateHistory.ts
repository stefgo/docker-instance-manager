import {
    AGENT_CAPABILITIES,
    CLIENT_STATUS,
    UPDATE_RESULTS,
    UPDATE_TRIGGERS,
    type Client,
    type ContainerUpdateRecord,
    type UpdateResult,
    type UpdateTrigger,
} from "@dim/shared";

/**
 * What the update history shows of an update, as pure functions: the dashboard's card and
 * the history page read the same ones.
 */

/** The names and the existence of the clients, which the rows link to while they are there. */
export interface ClientLookup {
    name: (clientId: string) => string;
    exists: (clientId: string) => boolean;
}

/** How many updates the dashboard's card lists. */
export const RECENT_UPDATES = 10;

export const TRIGGER_LABELS: Record<UpdateTrigger, string> = {
    auto: "Auto",
    manual: "Manual",
    external: "External",
};

export const TRIGGER_DESCRIPTIONS: Record<UpdateTrigger, string> = {
    auto: "Updated by the auto-update",
    manual: "Updated from the dashboard",
    external: "Updated on the host, outside of DIM",
};

export const RESULT_LABELS: Record<UpdateResult, string> = {
    updated: "Updated",
    failed: "Failed",
};

/** A digest or an image id the way `docker images` shortens it: twelve characters, no prefix. */
export function shortId(id: string | null | undefined): string | null {
    if (!id) return null;
    const bare = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    return bare.slice(0, 12) || null;
}

/** Both sides of an update, in one kind of name each, so the two can be read against each other. */
export interface VersionChange {
    from: string | null;
    to: string | null;
}

/**
 * What an update went from and to, in the most readable terms both sides have: the tags where
 * the tag changed, else the version labels, else the digests, else the image ids. A failed
 * update has no new image, so only what the container ran is named.
 */
export function versionChange(update: ContainerUpdateRecord): VersionChange {
    if (update.fromImageRef && update.fromImageRef !== update.imageRef) {
        return { from: update.fromImageRef, to: update.imageRef };
    }
    const pairs: [string | null, string | null][] = [
        [update.fromVersion ?? null, update.toVersion ?? null],
        [shortId(update.fromDigest), shortId(update.toDigest)],
        [shortId(update.fromImageId), shortId(update.toImageId)],
    ];
    if (update.result === "failed") {
        return { from: pairs.map(([from]) => from).find((from) => from !== null) ?? null, to: null };
    }
    const both = pairs.find(([from, to]) => from !== null && to !== null);
    if (both) return { from: both[0], to: both[1] };
    return { from: null, to: pairs.map(([, to]) => to).find((to) => to !== null) ?? null };
}

/** The change as one line of text, for a tooltip or a search. */
export function formatVersionChange(change: VersionChange): string {
    if (change.from && change.to) return `${change.from} → ${change.to}`;
    return change.to ?? change.from ?? "";
}

export interface UpdateFilters {
    trigger: UpdateTrigger | "all";
    result: UpdateResult | "all";
    clientId: string | "all";
}

export const NO_FILTERS: UpdateFilters = { trigger: "all", result: "all", clientId: "all" };

export const isFiltered = (filters: UpdateFilters): boolean =>
    filters.trigger !== "all" || filters.result !== "all" || filters.clientId !== "all";

export function matchesFilters(update: ContainerUpdateRecord, filters: UpdateFilters): boolean {
    return (
        (filters.trigger === "all" || update.trigger === filters.trigger) &&
        (filters.result === "all" || update.result === filters.result) &&
        (filters.clientId === "all" || update.clientId === filters.clientId)
    );
}

/** A value of the trigger filter as the address carries it, or "all" for anything else. */
export const triggerFilterOf = (value: string | null): UpdateFilters["trigger"] =>
    (UPDATE_TRIGGERS as readonly string[]).includes(value ?? "") ? (value as UpdateTrigger) : "all";

/** A value of the result filter as the address carries it, or "all" for anything else. */
export const resultFilterOf = (value: string | null): UpdateFilters["result"] =>
    (UPDATE_RESULTS as readonly string[]).includes(value ?? "") ? (value as UpdateResult) : "all";

/** Whether the search finds the update: by container, image, version, host or error. */
export function matchesSearch(update: ContainerUpdateRecord, query: string, clientName: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
        update.containerName,
        update.imageRef,
        update.fromImageRef,
        update.fromVersion,
        update.toVersion,
        clientName,
        update.error,
        TRIGGER_LABELS[update.trigger],
    ].some((text) => text?.toLowerCase().includes(q));
}

/**
 * The connected clients whose agent does not report updates, so a quiet history is not read
 * as a quiet host. A client that is not connected names no capabilities and is left out:
 * what its agent can do is not known until it is back.
 */
export function clientsWithoutHistory(clients: readonly Client[]): Client[] {
    return clients.filter(
        (client) =>
            client.status === CLIENT_STATUS.ONLINE &&
            Array.isArray(client.capabilities) &&
            !client.capabilities.includes(AGENT_CAPABILITIES.UPDATE_HISTORY),
    );
}
