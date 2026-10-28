import { describe, expect, it } from "vitest";
import { DockerActionRequestSchema, DockerActionSchema } from "./schemas.js";

describe("DockerActionRequestSchema", () => {
    it("takes an action on the whole host without a target", () => {
        expect(DockerActionRequestSchema.safeParse({ action: "image:prune" }).success).toBe(true);
        expect(DockerActionRequestSchema.safeParse({ action: "system:prune" }).success).toBe(true);
    });

    it("refuses any other action without a target", () => {
        const parsed = DockerActionRequestSchema.safeParse({ action: "container:stop" });
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]?.path).toEqual(["target"]);
    });
});

describe("DockerActionSchema", () => {
    it("takes an empty target for an action on the whole host", () => {
        expect(DockerActionSchema.safeParse({ actionId: "a", action: "system:prune", target: "" }).success).toBe(true);
    });

    it("refuses an empty target for any other action", () => {
        expect(DockerActionSchema.safeParse({ actionId: "a", action: "image:remove", target: "" }).success).toBe(false);
    });
});
