import { logger } from "@dim/shared/node";
import { readJsonFile, writeJsonFile } from "./DataStore.js";

/**
 * Writes are coalesced: a recreate produces a burst of entries within a second or two, and
 * each of them would otherwise be its own write-and-rename.
 */
const WRITE_DELAY_MS = 1000;

/**
 * How long a batch that went out may stay unacknowledged before it is offered again. The
 * server withholds the ack for what it failed to store; without a retry those entries would
 * wait for the next entry or the next reconnect, which on a quiet host may be days away.
 */
const ACK_RETRY_MS = 60_000;

export interface AckQueueOptions<T extends { id: string }> {
    /** The file in the data directory the queue survives a restart in. */
    file: string;
    /** What the log calls an entry, in the plural: "activity events". */
    label: string;
    /** Reads one stored entry, or null for one that is not to be taken on trust. */
    parse: (value: unknown) => T | null;
    /** When the entry happened, as ISO 8601; what its age is measured from. */
    timeOf: (entry: T) => string;
    /** How many entries the queue holds while it has nowhere to send them; the oldest go first. */
    maxItems: number;
    /** How old a queued entry may be before it is dropped unsent. */
    maxAgeMs: number;
}

/**
 * What an agent sends as an event: each entry counts, so it is kept until the server
 * acknowledges its id, on disk across restarts.
 *
 * Delivery is at-least-once. The id is given by the agent, so a repeat carries the same id
 * and the server's primary key makes the second copy a no-op.
 */
export class AckQueue<T extends { id: string }> {
    private entries: T[] = [];
    private loaded = false;
    private send: ((entries: T[]) => boolean) | null = null;
    private writeTimer: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;

    constructor(private readonly options: AckQueueOptions<T>) {}

    /**
     * Wires up the transport. `send` reports whether the batch went out; a false answer
     * leaves everything queued for the next connection.
     */
    setTransport(send: (entries: T[]) => boolean): void {
        this.send = send;
    }

    /** Queues one entry and offers the queue to the server. */
    push(entry: T): void {
        this.load();
        this.entries.push(entry);
        if (this.entries.length > this.options.maxItems) {
            const dropped = this.entries.length - this.options.maxItems;
            this.entries.splice(0, dropped);
            logger.warn({ dropped }, `Queue of ${this.options.label} full, dropped the oldest`);
        }
        this.persist();
        this.flush();
    }

    /**
     * Offers everything unacknowledged to the server. Called on every reconnect too.
     *
     * A batch that went out arms the retry timer; one that could not go out does not, since
     * the reconnect flushes anyway and a timer would only find the socket closed again.
     */
    flush(): void {
        this.load();
        this.clearRetry();
        this.expire();
        if (this.entries.length === 0 || !this.send) return;
        if (!this.send([...this.entries])) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.flush();
        }, ACK_RETRY_MS);
        this.retryTimer.unref?.();
    }

    /** Drops what the server has stored. Ids it does not name stay and are offered again. */
    acknowledge(ids: string[]): void {
        if (ids.length === 0) return;
        this.load();
        const acked = new Set(ids);
        const before = this.entries.length;
        this.entries = this.entries.filter((entry) => !acked.has(entry.id));
        if (this.entries.length !== before) this.persist();
        if (this.entries.length === 0) this.clearRetry();
    }

    /**
     * Writes the queue out now, for a shutdown that is about to end the process. The
     * scheduled write is unref'd so it cannot hold the agent open, which means a SIGTERM
     * arriving inside the coalescing window would otherwise take the last entries with it --
     * and a recreate, the one the agent performs on itself, is exactly such a SIGTERM.
     */
    persistNow(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }
        if (this.loaded) writeJsonFile(this.options.file, this.entries);
    }

    /** How many entries wait for an acknowledgement. */
    get size(): number {
        this.load();
        return this.entries.length;
    }

    /**
     * Reads back what the last run of the process had not had acknowledged. Anything that
     * does not parse is left out rather than taken on trust: these go on the wire as facts
     * about this host, and a damaged file must not turn into an entry nobody can source.
     */
    private load(): void {
        if (this.loaded) return;
        this.loaded = true;

        const stored = readJsonFile(this.options.file);
        if (!Array.isArray(stored)) return;

        const oldest = Date.now() - this.options.maxAgeMs;
        const entries: T[] = [];
        let dropped = 0;
        for (const value of stored) {
            const entry = this.options.parse(value);
            if (!entry || this.isExpired(entry, oldest)) {
                dropped++;
                continue;
            }
            entries.push(entry);
        }

        this.entries = entries.slice(-this.options.maxItems);
        if (this.entries.length > 0 || dropped > 0) {
            logger.info(
                { restored: this.entries.length, dropped },
                `Restored the queue of ${this.options.label} from disk`,
            );
        }
    }

    /** Schedules the queue to be written out, coalescing a burst into one write. */
    private persist(): void {
        if (this.writeTimer) return;
        this.writeTimer = setTimeout(() => {
            this.writeTimer = null;
            writeJsonFile(this.options.file, this.entries);
        }, WRITE_DELAY_MS);
        this.writeTimer.unref?.();
    }

    /**
     * Drops what has been queued longer than `maxAgeMs`. `load` does the same, but only once
     * per process: an agent that stays up through a fortnight without its server would
     * otherwise deliver the first morning's entries on reconnect. Checked before every send,
     * so nothing expired goes out.
     */
    private expire(): void {
        const oldest = Date.now() - this.options.maxAgeMs;
        const before = this.entries.length;
        this.entries = this.entries.filter((entry) => !this.isExpired(entry, oldest));
        const dropped = before - this.entries.length;
        if (dropped === 0) return;
        logger.warn({ dropped }, `Dropped queued ${this.options.label} older than the queue keeps`);
        this.persist();
    }

    /** Whether an entry happened before `oldest`. One without a readable time is kept. */
    private isExpired(entry: T, oldest: number): boolean {
        const occurred = Date.parse(this.options.timeOf(entry));
        return !Number.isNaN(occurred) && occurred < oldest;
    }

    private clearRetry(): void {
        if (!this.retryTimer) return;
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }
}
