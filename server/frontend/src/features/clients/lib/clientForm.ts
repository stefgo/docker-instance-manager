import { CONNECTION_MODE, UpdateClientSchema, type Client } from "@dim/shared";
import type { z } from "zod";
import type { FieldErrors, FieldOf } from "../../../lib/entityForm";

/** The client editor's fields, as typed. */
export interface ClientDraft {
    displayName: string;
    /** Outbound clients only: where the server dials the agent. */
    targetAddress: string;
    /** Inbound clients only: whether connections are checked against `allowedIp`. */
    restrictIp: boolean;
    allowedIp: string;
    /**
     * Three states in two controls: the box off means "inherit" (null), on with an
     * expression is this host's own schedule, on with an empty field means the host takes
     * part through its projects only.
     */
    ownCron: boolean;
    cron: string;
}

export type ClientUpdateInput = z.input<typeof UpdateClientSchema>;

/** What the server holds, as far as the form compares against it. */
type StoredClient = Pick<Client, "inboundAllowedIp" | "outboundTargetAddress" | "autoUpdateCron">;

export const isOutbound = (client: Pick<Client, "connectionMode">) =>
    client.connectionMode === CONNECTION_MODE.OUTBOUND;

export function clientDraftFrom(client: Client): ClientDraft {
    return {
        displayName: client.displayName || "",
        targetAddress: client.outboundTargetAddress || "",
        restrictIp: !!client.inboundAllowedIp,
        allowedIp: client.inboundAllowedIp || "",
        ownCron: client.autoUpdateCron !== null && client.autoUpdateCron !== undefined,
        cron: client.autoUpdateCron ?? "",
    };
}

/**
 * The draft as `PUT /api/v1/clients/:id` takes it. Which address is sent follows from the
 * connection mode: the backend rejects a target address for an inbound client and an
 * allowed address for an outbound one.
 *
 * An address and the schedule are sent only when they differ from what is stored. An absent
 * key leaves the stored value alone, so a value the schema would not accept today -- the
 * IPv6 address a client registered from, a target address written before it was checked --
 * stays savable as long as it is not touched. `null` is not "unchanged" but "switch the
 * check off", or "go back to the default schedule".
 */
export function clientInputFrom(draft: ClientDraft, outbound: boolean, stored: StoredClient): ClientUpdateInput {
    const input: ClientUpdateInput = { displayName: draft.displayName.trim() };

    if (outbound) {
        const targetAddress = draft.targetAddress.trim();
        if (targetAddress !== (stored.outboundTargetAddress || "")) input.outboundTargetAddress = targetAddress;
    } else if (!draft.restrictIp) {
        if (stored.inboundAllowedIp) input.inboundAllowedIp = null;
    } else {
        const allowedIp = draft.allowedIp.trim();
        if (allowedIp !== (stored.inboundAllowedIp || "")) input.inboundAllowedIp = allowedIp;
    }

    // `null` and `""` are different values here, so the comparison is against the stored
    // value as it is, not against a falsy reading of it.
    const cron = draft.ownCron ? draft.cron.trim() : null;
    if (cron !== (stored.autoUpdateCron ?? null)) input.autoUpdateCron = cron;

    return input;
}

/**
 * What of the draft is sent at all, and so what counts as a change. Unticking a box is a
 * change in its own right; what is left in the field under it is not.
 */
export function significantClientDraft(draft: ClientDraft, outbound: boolean): Partial<ClientDraft> {
    const schedule = { ownCron: draft.ownCron, cron: draft.ownCron ? draft.cron.trim() : "" };
    const displayName = draft.displayName.trim();
    if (outbound) return { displayName, targetAddress: draft.targetAddress.trim(), ...schedule };
    return {
        displayName,
        restrictIp: draft.restrictIp,
        allowedIp: draft.restrictIp ? draft.allowedIp.trim() : "",
        ...schedule,
    };
}

/** What the schema cannot say: which of the two addresses this client has to have. */
export function clientRules(draft: ClientDraft, outbound: boolean): FieldErrors<ClientDraft> {
    if (outbound) {
        return draft.targetAddress.trim() ? {} : { targetAddress: "An outbound client needs the address the server dials." };
    }
    // Required only while the box is ticked: that is what ticking it means.
    return draft.restrictIp && !draft.allowedIp.trim()
        ? { allowedIp: "Enter an address or a network, or untick the box above." }
        : {};
}

export const clientFieldOf: FieldOf<ClientDraft> = (path) => {
    switch (path[0]) {
        case "displayName":
            return "displayName";
        case "outboundTargetAddress":
            return "targetAddress";
        case "inboundAllowedIp":
            return "allowedIp";
        case "autoUpdateCron":
            return "cron";
        default:
            return null;
    }
};

/** What the form holds once it is stored: the server keeps the trimmed values. */
export function storedClientDraft(draft: ClientDraft): ClientDraft {
    return {
        ...draft,
        displayName: draft.displayName.trim(),
        targetAddress: draft.targetAddress.trim(),
        allowedIp: draft.allowedIp.trim(),
        cron: draft.cron.trim(),
    };
}
