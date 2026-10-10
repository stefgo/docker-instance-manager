import type { DockerEvent } from "./DockerEventMapper.js";

/**
 * Cuts the Docker event stream into its events. The daemon writes one JSON object per line,
 * and a chunk is whatever the socket happened to hand over: half an event, or -- when the
 * daemon replays what it has buffered -- a dozen at once.
 */
export class EventLineBuffer {
    private rest = "";

    /** The complete lines `chunk` brings to an end; what follows them waits for the next. */
    push(chunk: string): string[] {
        const lines = (this.rest + chunk).split("\n");
        this.rest = lines.pop() ?? "";
        return lines.map((line) => line.trim()).filter((line) => line.length > 0);
    }
}

function secondOf(event: DockerEvent): number | null {
    if (typeof event.time === "number" && event.time > 0) return event.time;
    if (typeof event.timeNano === "number" && event.timeNano > 0) return Math.floor(event.timeNano / 1_000_000_000);
    return null;
}

/**
 * `timeNano` is beyond what a JavaScript number holds exactly and is rounded on parsing, so
 * it does not tell two events apart on its own. The rounding is the same every time the same
 * event is parsed, though, and together with what happened to which object it names one.
 */
function keyOf(event: DockerEvent): string {
    return `${event.timeNano ?? ""}|${event.Type ?? ""}|${event.Action ?? ""}|${event.Actor?.ID ?? ""}`;
}

/**
 * How far into the Docker event stream this agent has read, so that a stream that broke can
 * be picked up where it stopped: the daemon keeps its latest events and replays them from
 * the `since` it is given.
 *
 * `since` is a whole second, the one the latest event fell into, so the replay begins with
 * events that have been through here already. They are recognised by their key and passed
 * over; only the keys of that one second are kept, because nothing earlier is replayed.
 *
 * The position lives in memory. It is not carried over a restart of the agent: written out
 * with a delay, as it would have to be, it would lag behind after a crash, and the events in
 * between would be reported a second time -- in the list and to every webhook.
 */
export class EventCursor {
    private second = 0;
    private seen = new Set<string>();

    /**
     * Sets the position before any event has been read, from the host's clock. Without it a
     * stream that breaks on a quiet host would have nothing to resume from.
     */
    begin(nowMs: number): void {
        if (this.second === 0) this.second = Math.floor(nowMs / 1000);
    }

    /** The second to resume from, or undefined while there is no position yet. */
    since(): number | undefined {
        return this.second > 0 ? this.second : undefined;
    }

    /** Takes note of an event. False for one that has been through here before. */
    advance(event: DockerEvent): boolean {
        const second = secondOf(event);
        // No clock, or stamped a moment before one that overtook it: neither can be part of
        // a replay, which starts at the second this cursor stands on.
        if (second === null || second < this.second) return true;
        if (second > this.second) {
            this.second = second;
            this.seen = new Set();
        }
        const key = keyOf(event);
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        return true;
    }
}
