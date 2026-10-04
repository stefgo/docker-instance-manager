import { describe, expect, it } from "vitest";
import { UpdateClientSchema } from "@dim/shared";
import { checkDraft, isSameDraft } from "../../../lib/entityForm";
import {
    clientFieldOf,
    clientInputFrom,
    clientRules,
    significantClientDraft,
    type ClientDraft,
} from "./clientForm";

const draft = (changes: Partial<ClientDraft> = {}): ClientDraft => ({
    displayName: "",
    targetAddress: "",
    restrictIp: false,
    allowedIp: "",
    ownCron: false,
    cron: "",
    ...changes,
});

const NOTHING = { inboundAllowedIp: null, outboundTargetAddress: null, autoUpdateCron: null };

const check = (d: ClientDraft, outbound: boolean, stored = NOTHING as Parameters<typeof clientInputFrom>[2]) =>
    checkDraft(
        {
            schema: UpdateClientSchema,
            toInput: (x: ClientDraft) => clientInputFrom(x, outbound, stored),
            fieldOf: clientFieldOf,
            rules: (x) => clientRules(x, outbound),
        },
        d,
    );

describe("clientInputFrom", () => {
    it("sends the name alone when nothing else changed", () => {
        expect(clientInputFrom(draft({ displayName: " web " }), false, NOTHING)).toEqual({ displayName: "web" });
    });

    it("leaves a stored address alone that the schema would refuse today", () => {
        const stored = { ...NOTHING, inboundAllowedIp: "fe80::1" };
        const d = draft({ restrictIp: true, allowedIp: "fe80::1", displayName: "web" });
        expect(clientInputFrom(d, false, stored)).toEqual({ displayName: "web" });
        expect(check(d, false, stored).isValid).toBe(true);
    });

    it("switches the address check off with null, and only when one is stored", () => {
        expect(clientInputFrom(draft(), false, { ...NOTHING, inboundAllowedIp: "10.0.0.1" })).toMatchObject({
            inboundAllowedIp: null,
        });
        expect(clientInputFrom(draft(), false, NOTHING)).not.toHaveProperty("inboundAllowedIp");
    });

    it("tells an empty schedule from an inherited one", () => {
        expect(clientInputFrom(draft({ ownCron: true }), false, NOTHING)).toMatchObject({ autoUpdateCron: "" });
        expect(clientInputFrom(draft(), false, { ...NOTHING, autoUpdateCron: "" })).toMatchObject({
            autoUpdateCron: null,
        });
        expect(clientInputFrom(draft({ ownCron: true }), false, { ...NOTHING, autoUpdateCron: "" })).not.toHaveProperty(
            "autoUpdateCron",
        );
    });

    it("sends a target address for an outbound client only", () => {
        expect(clientInputFrom(draft({ targetAddress: "10.0.0.5:3001" }), true, NOTHING)).toMatchObject({
            outboundTargetAddress: "10.0.0.5:3001",
        });
        expect(clientInputFrom(draft({ targetAddress: "10.0.0.5:3001" }), false, NOTHING)).not.toHaveProperty(
            "outboundTargetAddress",
        );
    });
});

describe("the client form's check", () => {
    it("reports a malformed allowed address at its field", () => {
        const result = check(draft({ restrictIp: true, allowedIp: "nonsense" }), false);
        expect(result.isValid).toBe(false);
        expect(result.errors.allowedIp).toMatch(/IPv4/);
    });

    it("asks for an address while the box is ticked", () => {
        expect(check(draft({ restrictIp: true }), false).errors.allowedIp).toBeDefined();
        expect(check(draft(), false).isValid).toBe(true);
    });

    it("reports a target address with a scheme at its field", () => {
        expect(check(draft({ targetAddress: "http://10.0.0.5" }), true).errors.targetAddress).toMatch(/host/);
    });

    it("asks an outbound client for its address", () => {
        expect(check(draft(), true).errors.targetAddress).toBeDefined();
    });
});

describe("significantClientDraft", () => {
    it("does not count an address left under an unticked box", () => {
        expect(
            isSameDraft(significantClientDraft(draft({ allowedIp: "10.0.0.1" }), false), significantClientDraft(draft(), false)),
        ).toBe(true);
    });

    it("counts unticking the box", () => {
        const stored = draft({ restrictIp: true, allowedIp: "10.0.0.1" });
        expect(
            isSameDraft(
                significantClientDraft({ ...stored, restrictIp: false }, false),
                significantClientDraft(stored, false),
            ),
        ).toBe(false);
    });

    it("does not count an expression left under an unticked schedule box", () => {
        expect(
            isSameDraft(significantClientDraft(draft({ cron: "0 4 * * 0" }), true), significantClientDraft(draft(), true)),
        ).toBe(true);
    });
});
