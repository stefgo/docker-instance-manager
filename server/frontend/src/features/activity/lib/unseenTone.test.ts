import { describe, expect, it } from "vitest";
import type { ActivityRecord } from "@dim/shared";
import { unseenProblems } from "./unseenTone";

const event = (id: string, kind: string, second: number, over: Partial<ActivityRecord> = {}): ActivityRecord => {
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
    return {
        id,
        kind,
        occurredAt: at,
        receivedAt: at,
        source: "agent",
        clientId: "h1",
        subject: { containerName: "web" },
        level: "info",
        seen: false,
        ...over,
    };
};

describe("unseenProblems", () => {
    it("counts unseen warnings and errors", () => {
        const died = event("d", "container.died", 1, { level: "warning" });
        const oom = event("o", "container.oom", 2, { level: "error" });
        const seen = event("s", "container.died", 3, { level: "warning", seen: true });
        expect(unseenProblems([seen, oom, died])).toEqual({ errors: 1, warnings: 1 });
    });
});
