import type { AgentMessages } from "@dim/shared";

/**
 * The messages that carry a state rather than an event: only the latest one means anything,
 * so nothing is queued while there is no connection, and every new connection is sent the
 * current value of each.
 */
export type StateMessage = "DOCKER_UPDATE" | "AGENT_STATUS" | "IMAGE_CHECKS";

type Payload<T extends StateMessage> = AgentMessages[T];

/**
 * One state this agent reports. A new one is a new entry in the list `StateReporter` is
 * given -- the connection knows nothing about any of them.
 */
export interface StateChannel<T extends StateMessage = StateMessage> {
    readonly type: T;
    /**
     * Whether a value equal to the last one sent on this connection is held back. Off for a
     * state the server may ask to have read again: its answer has to arrive even when
     * nothing changed.
     */
    readonly dedupe: boolean;
    /** Hands every new value to `emit` from now on. Called once, on the first connection. */
    subscribe(emit: (payload: Payload<T>) => void): void;
    /** Has the current value handed to `emit` again -- on every new connection. */
    refresh(): void;
}

/**
 * A channel over a source that can be read at any time and says when it changed.
 * `onChange` is subscribed once; `refresh` reads `current` and emits it.
 */
export function listenerChannel<T extends StateMessage>(
    type: T,
    current: () => Payload<T>,
    onChange: (listener: () => void) => void,
): StateChannel<T> {
    let emit: ((payload: Payload<T>) => void) | null = null;
    return {
        type,
        dedupe: true,
        subscribe(next) {
            emit = next;
            onChange(() => next(current()));
        },
        refresh() {
            emit?.(current());
        },
    };
}

/**
 * Sends the states this agent reports: all of them whenever a connection is established,
 * and each one again whenever it changes.
 *
 * Both connection modes call `connected()` after their handshake, and nothing else sends
 * a state. That is the point of having it: the steps after the handshake used to be
 * written out once per mode, and a state added to one of the two copies was never sent on
 * the other.
 */
export class StateReporter {
    private readonly lastSent = new Map<StateMessage, string>();
    private subscribed = false;

    /**
     * @param send Puts one message on the wire and reports whether it went out. A value
     *   that did not is not remembered as sent; the next connection sends it anyway.
     */
    constructor(
        private readonly channels: StateChannel[],
        private readonly send: (type: StateMessage, payload: unknown) => boolean,
    ) {}

    /** A connection has been established: sends the current value of every channel. */
    connected(): void {
        this.lastSent.clear();
        if (!this.subscribed) {
            this.subscribed = true;
            for (const channel of this.channels) {
                channel.subscribe((payload) => this.offer(channel, payload));
            }
        }
        for (const channel of this.channels) channel.refresh();
    }

    private offer(channel: StateChannel, payload: unknown): void {
        const key = channel.dedupe ? JSON.stringify(payload) : null;
        if (key !== null && this.lastSent.get(channel.type) === key) return;
        if (!this.send(channel.type, payload)) return;
        if (key !== null) this.lastSent.set(channel.type, key);
    }
}
