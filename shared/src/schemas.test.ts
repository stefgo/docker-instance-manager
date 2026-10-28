import { describe, expect, it } from "vitest";
import {
    AgentStatusSchema,
    AutoUpdatePolicySchema,
    DockerActionRequestSchema,
    DockerActionSchema,
    UpdateClientSchema,
} from "./schemas.js";

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

describe("UpdateClientSchema", () => {
    it("takes an auto-prune schedule on its own, and null to switch it off", () => {
        expect(UpdateClientSchema.safeParse({ autoPruneCron: " 0 4 * * * " }).data).toEqual({
            autoPruneCron: "0 4 * * *",
        });
        expect(UpdateClientSchema.safeParse({ autoPruneCron: null }).success).toBe(true);
    });

    it("refuses a body that changes nothing", () => {
        expect(UpdateClientSchema.safeParse({}).success).toBe(false);
    });
});

describe("AutoUpdatePolicySchema", () => {
    const policy = {
        updatedAt: "2026-10-28T00:00:00.000Z",
        host: { hostname: "docker-01", displayName: null },
        labelKey: "",
        labelValue: null,
        delayLabelKey: "",
        hostCron: "",
        projects: [],
    };

    it("reads a policy without a prune schedule as auto-prune off", () => {
        expect(AutoUpdatePolicySchema.parse(policy).pruneCron).toBe("");
    });

    it("keeps the prune schedule it carries", () => {
        expect(AutoUpdatePolicySchema.parse({ ...policy, pruneCron: "0 4 * * *" }).pruneCron).toBe("0 4 * * *");
    });
});

describe("AgentStatusSchema", () => {
    const autoUpdate = { lastRun: null, nextRun: null, runningSince: null };

    it("takes a status from an agent that predates auto-prune", () => {
        expect(AgentStatusSchema.safeParse({ autoUpdate, docker: null }).success).toBe(true);
    });

    it("takes the auto-prune state", () => {
        const autoPrune = { lastRun: "2026-10-28T04:00:01.000Z", nextRun: "2026-10-29T04:00:00.000Z", runningSince: null };
        expect(AgentStatusSchema.parse({ autoUpdate, autoPrune, docker: null }).autoPrune).toEqual(autoPrune);
    });
});
