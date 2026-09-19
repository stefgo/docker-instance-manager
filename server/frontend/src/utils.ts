import type { AlertOptions } from "@stefgo/react-ui-components";

/** What every view shows for a value that is not there. */
export const EMPTY_VALUE = "–";

/** A date from the API as a `Date`, or null when there is none or it cannot be read. */
const toDate = (date: Date | string | number | null | undefined): Date | null => {
    if (!date) return null;

    let d = new Date(date);

    if (typeof date === "string") {
        // Handle SQLite default format "YYYY-MM-DD HH:MM:SS" -> Treat as UTC
        if (date.includes(" ") && !date.includes("T")) {
            d = new Date(date.replace(" ", "T") + "Z");
        }
    }

    return isNaN(d.getTime()) ? null : d;
};

/**
 * The one date format of the interface. Seconds only where they tell events apart -- the
 * activity list, where several steps of one operation land within the same minute.
 */
export const formatDate = (
    date: Date | string | number | null | undefined,
    { seconds = false }: { seconds?: boolean } = {},
): string => {
    const d = toDate(date);
    if (!d) return EMPTY_VALUE;

    return new Intl.DateTimeFormat("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        ...(seconds ? { second: "2-digit" as const } : {}),
        hour12: false,
    }).format(d);
};

/** The time of day alone, for entries that sit under a dated one. */
export const formatTime = (date: Date | string | number | null | undefined): string => {
    const d = toDate(date);
    if (!d) return EMPTY_VALUE;

    return new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(d);
};

export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * A duration the way `docker ps` writes it ("About an hour", "3 days") -- a port of
 * go-units' HumanDuration, so a status the dashboard derives reads like the one Docker sent.
 */
export const humanDuration = (ms: number): string => {
    const seconds = Math.floor(Math.max(ms, 0) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.round(seconds / 3600);

    if (seconds < 1) return "Less than a second";
    if (seconds === 1) return "1 second";
    if (seconds < 60) return `${seconds} seconds`;
    if (minutes === 1) return "About a minute";
    if (minutes < 60) return `${minutes} minutes`;
    if (hours === 1) return "About an hour";
    if (hours < 48) return `${hours} hours`;
    if (hours < 24 * 7 * 2) return `${Math.floor(hours / 24)} days`;
    if (hours < 24 * 30 * 2) return `${Math.floor(hours / 24 / 7)} weeks`;
    if (hours < 24 * 365 * 2) return `${Math.floor(hours / 24 / 30)} months`;
    return `${Math.floor(seconds / 3600 / 24 / 365)} years`;
};

/** A count with its noun: "1 host", "3 hosts". `many` for nouns without a plain -s plural. */
export const plural = (count: number, one: string, many = `${one}s`): string =>
    `${count} ${count === 1 ? one : many}`;

/**
 * How a client is named everywhere: its display name, or its hostname while it has none.
 * `||` rather than `??` on purpose: an empty display name must fall back as well, or the row
 * shows no name at all.
 */
export const clientName = (client: { displayName?: string | null; hostname: string }): string =>
    client.displayName || client.hostname;

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

/**
 * A failure as a notice: the title says what did not happen, the server's message why.
 * For an action that was not asked about first -- one that was reports its failure inside
 * its own dialog instead (see `onConfirm` in useConfirm).
 */
export const describeFailure = (title: string, error: unknown): AlertOptions => ({
    title,
    description: getErrorMessage(error),
});
