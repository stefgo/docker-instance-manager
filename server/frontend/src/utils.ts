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

/** The same in milliseconds, for what is compared rather than shown. */
export const toTimestamp = (date: Date | string | number | null | undefined): number | null =>
    toDate(date)?.getTime() ?? null;

/**
 * The one date format of the interface, as the viewer's own locale writes it: the order
 * of day and month and the clock are theirs, not the application's. `locale` is for a
 * caller that must not depend on where it runs; left out, the browser's is taken.
 *
 * Seconds only where they tell events apart -- the activity list, where several steps of
 * one operation land within the same minute.
 */
export const formatDate = (
    date: Date | string | number | null | undefined,
    { seconds = false, locale }: { seconds?: boolean; locale?: string } = {},
): string => {
    const d = toDate(date);
    if (!d) return EMPTY_VALUE;

    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        ...(seconds ? { second: "2-digit" as const } : {}),
    }).format(d);
};

/**
 * A point in time as Docker's list endpoints give it -- `Created` of a container and of an
 * image, in seconds since the epoch -- in the milliseconds every date here is made of.
 * `null` for a zero: Docker writes that for an image that carries no date, and it must
 * read as "not known" rather than as 1970.
 */
export const fromDockerSeconds = (seconds: number | null | undefined): number | null =>
    seconds ? seconds * 1000 : null;

/**
 * How long ago something happened, short enough for a column: "just now", "5 min ago",
 * "2 h ago", "3 d ago". Past thirty days the distance stops saying anything, and a date
 * that lies ahead has none, so both are written out as the date they are.
 *
 * A column of these reads as "what was recent"; the date itself belongs in the tooltip
 * next to it (`RelativeTime`).
 */
export const formatRelative = (
    date: Date | string | number | null | undefined,
    now: number,
    locale?: string,
): string => {
    const at = toTimestamp(date);
    if (at === null) return EMPTY_VALUE;

    const minutes = Math.floor((now - at) / 60_000);
    // A clock that is a little ahead of the host's must not turn "now" into a date.
    if (minutes < 1 && now - at > -60_000) return "just now";
    if (minutes < 0) return formatDate(at, { locale });
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days <= 30) return `${days} d ago`;
    return formatDate(at, { locale });
};

/** The time of day alone, for entries that sit under a dated one. */
export const formatTime = (date: Date | string | number | null | undefined, locale?: string): string => {
    const d = toDate(date);
    if (!d) return EMPTY_VALUE;

    return new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
