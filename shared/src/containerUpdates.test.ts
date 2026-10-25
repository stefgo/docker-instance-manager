import { describe, expect, it } from "vitest";
import { ContainerUpdateBatchEnvelopeSchema, ContainerUpdateSchema } from "./schemas.js";

const update = {
    id: "u1",
    occurredAt: "2026-10-25T08:00:00Z",
    containerName: "web",
    imageRef: "nginx:1.27",
    trigger: "manual",
    result: "updated",
};

describe("ContainerUpdateSchema", () => {
    it("reads an update with nothing but what it must carry", () => {
        expect(ContainerUpdateSchema.parse(update)).toEqual(update);
    });

    // An agent of a newer build may know a trigger or a result this one does not.
    it("reads a trigger and a result it does not know rather than refuse the update", () => {
        const parsed = ContainerUpdateSchema.parse({ ...update, trigger: "scheduled", result: "rolled-back" });
        expect(parsed.trigger).toBe("external");
        expect(parsed.result).toBe("updated");
    });

    it("refuses an update without the container it is about", () => {
        expect(ContainerUpdateSchema.safeParse({ ...update, containerName: "" }).success).toBe(false);
        expect(ContainerUpdateSchema.safeParse({ ...update, imageRef: undefined }).success).toBe(false);
    });
});

describe("ContainerUpdateBatchEnvelopeSchema", () => {
    it("reads the envelope without judging its entries", () => {
        expect(ContainerUpdateBatchEnvelopeSchema.safeParse({ updates: [{ nonsense: true }] }).success).toBe(true);
    });

    it("refuses an empty batch", () => {
        expect(ContainerUpdateBatchEnvelopeSchema.safeParse({ updates: [] }).success).toBe(false);
    });
});
